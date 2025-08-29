import { GoogleGenAI, Modality } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// Maximum prompt length (characters)
const MAX_PROMPT_LENGTH = 2000;
// API timeout in milliseconds
const API_TIMEOUT = 30000; // 30 seconds

export const maxDuration = 60; // Maximum function duration in seconds for Vercel

export async function POST(request: NextRequest) {
  // Add headers to prevent caching and ensure fresh responses
  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  try {
    console.log('[API] Request received');
    
    const body = await request.json();
    const { prompt, referenceImage, previousImages } = body;

    console.log('[API] Prompt received:', prompt?.substring(0, 100) + (prompt?.length > 100 ? '...' : ''));
    console.log('[API] Reference image provided:', !!referenceImage);
    console.log('[API] Previous images count:', previousImages?.length || 0);

    if (!prompt || typeof prompt !== 'string') {
      console.log('[API] Invalid prompt provided');
      return NextResponse.json(
        { error: '프롬프트를 입력해주세요.' },
        { status: 400, headers }
      );
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      console.log('[API] Empty prompt after trim');
      return NextResponse.json(
        { error: '유효한 프롬프트를 입력해주세요.' },
        { status: 400, headers }
      );
    }

    // Add English prefix to improve generation success rate for Korean prompts
    // Check if the prompt is likely Korean (contains Korean characters)
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(trimmedPrompt);
    const enhancedPrompt = hasKorean 
      ? `Please create and modify according to the request below: ${trimmedPrompt}`
      : trimmedPrompt;
    
    console.log('[API] Original prompt:', trimmedPrompt.substring(0, 100));
    console.log('[API] Enhanced prompt:', enhancedPrompt.substring(0, 100));
    console.log('[API] Has Korean characters:', hasKorean);

    // Validate prompt length (use enhanced prompt for length check)
    if (enhancedPrompt.length > MAX_PROMPT_LENGTH) {
      console.log('[API] Prompt too long:', enhancedPrompt.length);
      return NextResponse.json(
        { error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하여야 합니다. 현재: ${trimmedPrompt.length}자` },
        { status: 400, headers }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[API] No API key configured');
      return NextResponse.json(
        { error: 'Gemini API 키가 설정되지 않았습니다.' },
        { status: 500, headers }
      );
    }

    console.log('[API] API key found, length:', apiKey.length);

    // Create new AI instance exactly as in the guide
    console.log('[API] Creating AI instance...');
    
    // Set API key in environment for the GoogleGenAI constructor
    process.env.GOOGLE_GENAI_API_KEY = apiKey;
    
    const ai = new GoogleGenAI({});

    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API 요청 시간 초과')), API_TIMEOUT);
    });

    console.log('[API] Calling Gemini API...');
    console.log('[API] Model: gemini-2.5-flash-image-preview');
    console.log('[API] Enhanced prompt length:', enhancedPrompt.length);

    // Build contents array based on whether we have reference image
    let contents: any[] = [];
    
    if (referenceImage) {
      // Extract base64 data from data URL if needed
      let imageData = referenceImage;
      if (referenceImage.startsWith('data:')) {
        const base64Match = referenceImage.match(/base64,(.*)/);
        if (base64Match) {
          imageData = base64Match[1];
        }
      }
      
      // Include previous conversation if in multi-turn mode
      if (previousImages && previousImages.length > 0) {
        console.log('[API] Building multi-turn conversation context...');
        for (const prev of previousImages) {
          if (prev.image) {
            let prevImageData = prev.image;
            if (prev.image.startsWith('data:')) {
              const match = prev.image.match(/base64,(.*)/);
              if (match) {
                prevImageData = match[1];
              }
            }
            // Use enhanced prompt for previous images too if they contain Korean
            const prevHasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(prev.prompt);
            const enhancedPrevPrompt = prevHasKorean 
              ? `Please create and modify according to the request below: ${prev.prompt}`
              : prev.prompt;
            
            contents.push([
              { text: enhancedPrevPrompt },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: prevImageData
                }
              }
            ]);
          }
        }
      }
      
      // Add current prompt with reference image
      contents = [
        { text: enhancedPrompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: imageData
          }
        }
      ];
      console.log('[API] Using reference image with enhanced prompt for generation');
    } else {
      // Text-only prompt
      contents = enhancedPrompt;
      console.log('[API] Using text-only enhanced prompt for generation');
    }
    
    console.log('[API] Using prompt and image for generation...');
    
    const response = await Promise.race([
      ai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: contents,
      }),
      timeoutPromise
    ]) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { data: string; mimeType?: string } }> } }> };

    console.log('[API] Response received from Gemini');
    console.log('[API] Response structure:', {
      hasCandidates: !!response?.candidates,
      candidatesLength: response?.candidates?.length || 0
    });

    // Process the response exactly like the guide
    let imageBase64 = null;
    let imageMimeType = 'image/png';
    let textResponse = '';

    console.log('[API] Processing response like the guide...');
    
    // Direct access like in the guide: response.candidates[0].content.parts
    try {
      if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          console.log('[API] Processing part:', {
            hasText: !!part.text,
            hasInlineData: !!part.inlineData,
            partKeys: Object.keys(part)
          });
          
          if (part.text) {
            textResponse = part.text;
            console.log('[API] Found text response:', part.text);
          } else if (part.inlineData) {
            imageBase64 = part.inlineData.data;
            imageMimeType = part.inlineData.mimeType || 'image/png';
            console.log('[API] Found image data! Length:', part.inlineData.data.length);
            console.log('[API] Image mime type:', imageMimeType);
          }
        }
      } else {
        console.log('[API] No valid structure found in response');
      }
    } catch (error) {
      console.log('[API] Error processing response:', error);
      console.log('[API] Response candidates:', response.candidates);
    }

    console.log('[API] Final results:', {
      hasImageData: !!imageBase64,
      hasTextResponse: !!textResponse,
      textLength: textResponse?.length || 0
    });

    if (imageBase64) {
      // Convert base64 to data URL for direct display in browser
      const imageDataUrl = `data:${imageMimeType};base64,${imageBase64}`;
      console.log('[API] Successfully created image data URL');
      
      return NextResponse.json({ 
        success: true,
        imageUrl: imageDataUrl,
        type: 'generated_image',
        text: textResponse || 'Image generated successfully'
      }, { headers });
    } else {
      // Fallback if no image was generated
      return NextResponse.json({ 
        success: true,
        imageUrl: null,
        type: 'text_only',
        text: textResponse || 'No image was generated. Please try a different prompt.'
      }, { headers });
    }

  } catch (error) {
    console.error('Error generating image:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === 'API 요청 시간 초과') {
        return NextResponse.json(
          { error: '요청 시간이 초과되었습니다. 더 짧은 프롬프트를 시도해보세요.' },
          { status: 408, headers }
        );
      }
      
      if (error.message.includes('quota') || error.message.includes('limit')) {
        return NextResponse.json(
          { error: 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429, headers }
        );
      }
      
      if (error.message.includes('Invalid API key')) {
        return NextResponse.json(
          { error: '유효하지 않은 API 키입니다. 설정을 확인해주세요.' },
          { status: 401, headers }
        );
      }
    }
    
    return NextResponse.json(
      { error: '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500, headers }
    );
  }
}