'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface GenerationResult {
  imageUrl: string | null;
  text: string;
  type: 'generated_image' | 'text_only';
}

interface ConversationHistory {
  prompt: string;
  referenceImage?: string;
  result: GenerationResult;
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory[]>([]);
  const [imageLoadStatus, setImageLoadStatus] = useState<{ [key: number]: 'loading' | 'loaded' | 'error' }>({});
  
  // Debug: Log conversation history changes
  useEffect(() => {
    console.log('[Debug] Conversation history updated:', conversationHistory);
    if (typeof window !== 'undefined') {
      (window as any).debugHistory = conversationHistory;
    }
  }, [conversationHistory]);
  const [isMultiTurnMode, setIsMultiTurnMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use refs to keep track of current request
  const currentControllerRef = useRef<AbortController | null>(null);
  const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_PROMPT_LENGTH = 2000;
  const REQUEST_TIMEOUT = 30000; // 30 seconds

  // Cleanup function to abort current request and clear timeout
  const cleanup = useCallback(() => {
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
      currentControllerRef.current = null;
    }
    if (currentTimeoutRef.current) {
      clearTimeout(currentTimeoutRef.current);
      currentTimeoutRef.current = null;
    }
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const selectHistoryImage = useCallback((index: number) => {
    // Rollback to a specific point in conversation history
    const selectedHistory = conversationHistory[index];
    if (selectedHistory.result.imageUrl) {
      setReferenceImage(selectedHistory.result.imageUrl);
      // Keep only the history up to the selected point
      setConversationHistory(conversationHistory.slice(0, index + 1));
    }
  }, [conversationHistory]);

  const generateImage = useCallback(async (isRetry = false) => {
    // Cleanup any existing request
    cleanup();

    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      setError(`프롬프트는 ${MAX_PROMPT_LENGTH}자 이하여야 합니다.`);
      return;
    }

    setLoading(true);
    setError(null);
    if (!isRetry) {
      setResult(null);
      setRetryCount(0);
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    currentControllerRef.current = controller;

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (currentControllerRef.current === controller) {
        controller.abort();
      }
    }, REQUEST_TIMEOUT);
    currentTimeoutRef.current = timeoutId;

    try {
      // Include conversation history if in multi-turn mode
      const previousImages = isMultiTurnMode ? conversationHistory.map(h => ({
        prompt: h.prompt,
        image: h.result.imageUrl
      })) : [];

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          referenceImage: referenceImage,
          previousImages: previousImages
        }),
        signal: controller.signal,
        // Add cache control to prevent caching issues
        cache: 'no-cache'
      });

      // Clear timeout if request completed
      if (currentTimeoutRef.current === timeoutId) {
        clearTimeout(timeoutId);
        currentTimeoutRef.current = null;
      }

      // Check if this request is still current
      if (currentControllerRef.current !== controller) {
        return; // Request was superseded
      }

      const data = await response.json();

      console.log('[Client] API Response status:', response.status);
      console.log('[Client] API Response data:', {
        hasImageUrl: !!data.imageUrl,
        imageUrlLength: data.imageUrl?.length,
        firstChars: data.imageUrl?.substring(0, 100),
        type: data.type,
        success: data.success,
        text: data.text
      });

      if (!response.ok) {
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      const newResult: GenerationResult = {
        imageUrl: data.imageUrl || null,
        text: data.text || '',
        type: data.imageUrl ? 'generated_image' : 'text_only'
      };
      
      console.log('[Client] New result:', {
        hasImageUrl: !!newResult.imageUrl,
        imageUrlLength: newResult.imageUrl?.length,
        imageUrlPrefix: newResult.imageUrl?.substring(0, 50),
        type: newResult.type,
        isMultiTurnMode: isMultiTurnMode
      });
      
      setResult(newResult);
      setRetryCount(0);
      
      // Add to conversation history if in multi-turn mode and image was generated
      if (isMultiTurnMode && newResult.imageUrl) {
        const newHistoryItem = {
          prompt: prompt.trim(),
          referenceImage: referenceImage || undefined,
          result: {
            imageUrl: newResult.imageUrl,
            text: newResult.text,
            type: newResult.type as 'generated_image' | 'text_only'
          }
        };
        console.log('[Client] Adding to history:', {
          prompt: newHistoryItem.prompt,
          hasResult: !!newHistoryItem.result,
          resultImageUrl: newHistoryItem.result.imageUrl?.substring(0, 100),
          resultType: newHistoryItem.result.type
        });
        
        // Verify the image URL is valid before adding to history
        if (newResult.imageUrl.startsWith('data:image')) {
          setConversationHistory(prev => {
            const updated = [...prev, newHistoryItem];
            console.log('[Client] Updated history length:', updated.length);
            console.log('[Client] Last item in history:', {
              index: updated.length - 1,
              prompt: updated[updated.length - 1].prompt,
              hasImageUrl: !!updated[updated.length - 1].result.imageUrl,
              imageUrlStart: updated[updated.length - 1].result.imageUrl?.substring(0, 50)
            });
            return updated;
          });
          // Use the generated image as reference for next turn (whether it's the first or subsequent generations)
          setReferenceImage(newResult.imageUrl);
          // Clear the prompt for next input
          setPrompt('');
        } else {
          console.error('[Client] Invalid image URL format:', newResult.imageUrl?.substring(0, 100));
        }
      }
    } catch (err) {
      // Check if this request is still current
      if (currentControllerRef.current !== controller) {
        return; // Request was superseded
      }

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // Don't show error if request was manually aborted
          if (currentControllerRef.current === controller) {
            setError('요청 시간이 초과되었습니다. 더 짧은 프롬프트를 시도해보세요.');
          }
        } else {
          setError(err.message);
        }
      } else {
        setError('오류가 발생했습니다.');
      }
    } finally {
      // Only update loading state if this is still the current request
      if (currentControllerRef.current === controller) {
        setLoading(false);
        currentControllerRef.current = null;
      }
      
      // Clear timeout reference if it matches
      if (currentTimeoutRef.current === timeoutId) {
        currentTimeoutRef.current = null;
      }
    }
  }, [prompt, cleanup, MAX_PROMPT_LENGTH, referenceImage, isMultiTurnMode, conversationHistory]);

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    generateImage(true);
  }, [generateImage]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const downloadImage = () => {
    if (!result?.imageUrl) return;
    
    const link = document.createElement('a');
    link.href = result.imageUrl;
    link.download = `gemini-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mt-10">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Gemini AI 이미지 생성기
          </h1>
          <p className="text-center text-gray-600 mb-8">
            텍스트 설명을 입력하면 AI가 이미지를 생성합니다
          </p>

          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMultiTurnMode}
                  onChange={(e) => {
                    setIsMultiTurnMode(e.target.checked);
                    if (!e.target.checked) {
                      setConversationHistory([]);
                      setReferenceImage(null);
                    }
                  }}
                  className="mr-3 h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  멀티턴 편집 모드 (대화형 이미지 편집)
                </span>
              </label>
              {isMultiTurnMode && conversationHistory.length > 0 && (
                <button
                  onClick={() => {
                    setConversationHistory([]);
                    setReferenceImage(null);
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  대화 초기화
                </button>
              )}
            </div>

            {/* Reference Image Upload */}
            {!isMultiTurnMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  참조 이미지 (선택사항)
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition duration-200"
                  >
                    이미지 선택
                  </button>
                  {referenceImage && (
                    <button
                      onClick={() => setReferenceImage(null)}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition duration-200"
                    >
                      이미지 제거
                    </button>
                  )}
                </div>
                {referenceImage && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <img 
                      src={referenceImage} 
                      alt="Reference" 
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Initial Image Upload for Multi-turn Mode */}
            {isMultiTurnMode && conversationHistory.length === 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  시작 이미지 업로드 (선택사항)
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition duration-200"
                  >
                    시작 이미지 선택
                  </button>
                  {referenceImage && (
                    <button
                      onClick={() => setReferenceImage(null)}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition duration-200"
                    >
                      이미지 제거
                    </button>
                  )}
                </div>
                {referenceImage && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <img 
                      src={referenceImage} 
                      alt="Starting image" 
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Image History Gallery */}
            {isMultiTurnMode && conversationHistory.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="text-sm font-medium text-blue-800 mb-3">생성된 이미지 기록</h3>
                <div className="space-y-3">
                  {/* Current/Selected Reference Image */}
                  {referenceImage && (
                    <div className="p-3 bg-white rounded-lg border-2 border-indigo-500">
                      <div className="flex items-start gap-3">
                        <img
                          src={referenceImage}
                          alt="Current reference"
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-indigo-700 mb-1">현재 참조 이미지</div>
                          <div className="text-xs text-gray-600">
                            {conversationHistory.findIndex(h => h.result.imageUrl === referenceImage) >= 0
                              ? `${conversationHistory.findIndex(h => h.result.imageUrl === referenceImage) + 1}단계에서 생성됨`
                              : '시작 이미지'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Image History Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {conversationHistory.map((item, index) => {
                      console.log(`[Gallery] Item ${index}:`, {
                        hasImageUrl: !!item.result?.imageUrl,
                        imageUrlLength: item.result?.imageUrl?.length,
                        imageUrlPrefix: item.result?.imageUrl?.substring(0, 50),
                        result: item.result
                      });
                      return (
                        <div key={index} className="flex flex-col">
                          <button
                            onClick={() => selectHistoryImage(index)}
                            className={`relative group transition-all duration-200 block ${
                              referenceImage === item.result.imageUrl
                                ? 'ring-2 ring-indigo-500 rounded-lg shadow-lg'
                                : 'hover:ring-2 hover:ring-gray-300 rounded-lg hover:shadow-md'
                            }`}
                          >
                            <div className="w-full aspect-square relative bg-gray-100 rounded-lg overflow-hidden">
                              {item.result?.imageUrl ? (
                                <>
                                  {/* Loading indicator */}
                                  {imageLoadStatus[index] !== 'loaded' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                                      {imageLoadStatus[index] === 'error' ? (
                                        <span className="text-gray-500 text-xs">로딩 실패</span>
                                      ) : (
                                        <div className="animate-pulse">
                                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <img
                                    src={item.result.imageUrl}
                                    alt={`Step ${index + 1}`}
                                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                                      imageLoadStatus[index] === 'loaded' ? 'opacity-100' : 'opacity-0'
                                    }`}
                                    onError={(e) => {
                                      console.error(`[Gallery] Image failed to load at index ${index}:`, {
                                        src: (e.target as HTMLImageElement).src?.substring(0, 100),
                                        error: e
                                      });
                                      setImageLoadStatus(prev => ({ ...prev, [index]: 'error' }));
                                    }}
                                    onLoad={(e) => {
                                      console.log(`[Gallery] Image loaded successfully at index ${index}`, {
                                        naturalWidth: (e.target as HTMLImageElement).naturalWidth,
                                        naturalHeight: (e.target as HTMLImageElement).naturalHeight,
                                        src: (e.target as HTMLImageElement).src?.substring(0, 100)
                                      });
                                      setImageLoadStatus(prev => ({ ...prev, [index]: 'loaded' }));
                                    }}
                                  />
                                </>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                                  No Image
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-1 z-10">
                                {index + 1}단계
                              </div>
                              {referenceImage === item.result.imageUrl && (
                                <div className="absolute top-1 right-1 bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded shadow z-10">
                                  선택됨
                                </div>
                              )}
                            </div>
                          </button>
                        <div className="mt-1 text-xs text-gray-600 text-center truncate px-1" title={item.prompt}>
                          {item.prompt}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
                
                <div className="mt-3 space-y-2">
                  <div className="p-2 bg-yellow-50 rounded text-xs text-yellow-800">
                    💡 이미지를 클릭하면 해당 시점으로 되돌아갈 수 있습니다
                  </div>
                  {conversationHistory.length > 0 && (
                    <div className="text-xs text-gray-600">
                      총 {conversationHistory.length}개의 편집 단계가 있습니다
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
                  프롬프트 입력
                </label>
                <span className={`text-sm ${prompt.length > MAX_PROMPT_LENGTH ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {prompt.length} / {MAX_PROMPT_LENGTH}
                </span>
              </div>
              <textarea
                id="prompt"
                rows={4}
                maxLength={MAX_PROMPT_LENGTH + 100} // Allow slight overflow to show the warning
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition duration-200 ${
                  prompt.length > MAX_PROMPT_LENGTH ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder={isMultiTurnMode && conversationHistory.length > 0 
                  ? "예: '이제 색상을 노란색으로 바꿔 줘'" 
                  : "예: 일몰이 보이는 아름다운 해변, 야자수가 있고 파도가 부드럽게 치는 모습"}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              {prompt.length > MAX_PROMPT_LENGTH && (
                <p className="mt-1 text-sm text-red-600">
                  프롬프트가 너무 깁니다. {prompt.length - MAX_PROMPT_LENGTH}자를 줄여주세요.
                </p>
              )}
            </div>

            <button
              onClick={() => generateImage()}
              disabled={loading || prompt.length > MAX_PROMPT_LENGTH}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium py-3 px-6 rounded-lg hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {retryCount > 0 ? `재시도 중... (${retryCount}/3)` : '생성 중...'}
                </span>
              ) : (
                '이미지 생성'
              )}
            </button>
            
            {loading && (
              <button
                onClick={cleanup}
                className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
              >
                요청 취소
              </button>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 mb-3">{error}</p>
              {!loading && retryCount < 3 && (
                <button
                  onClick={handleRetry}
                  className="text-sm bg-red-600 hover:bg-red-700 text-white font-medium py-1.5 px-4 rounded transition duration-200"
                >
                  다시 시도 {retryCount > 0 && `(${retryCount}/3)`}
                </button>
              )}
              {retryCount >= 3 && (
                <p className="text-sm text-red-500 mt-2">
                  여러 번 시도했지만 실패했습니다. 잠시 후 다시 시도해주세요.
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="mt-6 p-6 bg-gray-50 rounded-lg">
              <h2 className="text-lg font-semibold mb-3 text-gray-800">생성 결과</h2>
              
              {result.type === 'generated_image' && result.imageUrl ? (
                <div className="space-y-4">
                  {/* Generated Image Display */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="relative w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={result.imageUrl} 
                        alt="Generated image" 
                        className="w-full h-auto rounded-lg shadow-lg"
                      />
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={downloadImage}
                      className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition duration-200 flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      이미지 다운로드
                    </button>
                  </div>
                  
                  {/* Text Response if any */}
                  {result.text && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">{result.text}</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Text-only response */
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <p className="text-gray-700 whitespace-pre-wrap">{result.text}</p>
                  </div>
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>알림:</strong> 이미지가 생성되지 않았습니다. 
                      다른 프롬프트를 시도해보거나 API 키 설정을 확인해주세요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Powered by Google Gemini AI</p>
        </div>
      </div>
    </main>
  );
}
