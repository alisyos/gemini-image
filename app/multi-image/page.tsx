'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

interface ImageInput {
  id: string;
  file: string | null;
  prompt: string;
  description: string;
  isMain?: boolean;
}

interface GenerationResult {
  imageUrl: string | null;
  text: string;
  type: 'generated_image' | 'text_only';
}

export default function MultiImageGenerator() {
  const [images, setImages] = useState<ImageInput[]>([
    { id: '1', file: null, prompt: '해당 이미지를 중심으로 이미지가 생성되어야 합니다.', description: '메인 이미지', isMain: true },
    { id: '2', file: null, prompt: '스타일 참조용 입니다. 해당 이미지가 직접적으로 사용되어서는 안됩니다.', description: '스타일 참조용', isMain: false },
    { id: '3', file: null, prompt: '배경 참조용 입니다. 배경 외에는 사용되어서는 안됩니다.', description: '배경 참조용', isMain: false },
    { id: '4', file: null, prompt: '', description: '추가 요소 1', isMain: false },
    { id: '5', file: null, prompt: '', description: '추가 요소 2', isMain: false },
  ]);
  
  const [mainPrompt, setMainPrompt] = useState('Please composite the provided images according to your request.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeImageCount, setActiveImageCount] = useState(0);
  const [dragActive, setDragActive] = useState<{ [key: string]: boolean }>({});
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const MAX_PROMPT_LENGTH = 2000;

  useEffect(() => {
    const count = images.filter(img => img.file !== null).length;
    setActiveImageCount(count);
  }, [images]);

  const handleImageUpload = useCallback((imageId: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setImages(prev => prev.map(img => 
        img.id === imageId 
          ? { ...img, file: reader.result as string }
          : img
      ));
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePromptChange = useCallback((imageId: string, prompt: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, prompt }
        : img
    ));
  }, []);

  const handleDescriptionChange = useCallback((imageId: string, description: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, description }
        : img
    ));
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, file: null, prompt: '' }
        : img
    ));
  }, []);

  const handleDrag = useCallback((e: React.DragEvent, imageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(prev => ({ ...prev, [imageId]: true }));
    } else if (e.type === "dragleave") {
      setDragActive(prev => ({ ...prev, [imageId]: false }));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, imageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [imageId]: false }));
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleImageUpload(imageId, file);
      } else {
        setError('이미지 파일만 업로드 가능합니다.');
        setTimeout(() => setError(null), 3000);
      }
    }
  }, [handleImageUpload]);

  const setAsMainImage = useCallback((imageId: string) => {
    setImages(prev => prev.map(img => ({
      ...img,
      isMain: img.id === imageId
    })));
  }, []);

  const generateImage = useCallback(async () => {
    const uploadedImages = images.filter(img => img.file !== null);
    
    if (uploadedImages.length === 0) {
      setError('최소 1개 이상의 이미지를 업로드해주세요.');
      return;
    }

    if (!mainPrompt.trim()) {
      setError('메인 프롬프트를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Simply send all images in order with their metadata
      const referenceImage = uploadedImages[0].file;
      const previousImages = uploadedImages.slice(1).map(img => ({
        prompt: img.prompt || img.description,
        image: img.file,
        description: img.description,
        isMain: img.isMain
      }));
      
      // Create a clear prompt that describes each image's role
      const imageDescriptions = uploadedImages.map((img, idx) => {
        const imageNum = idx + 1;
        const role = img.isMain ? '(MAIN - 변환 대상)' : '(참조용)';
        return `Image ${imageNum} ${role}: ${img.description}${img.prompt ? ` - ${img.prompt}` : ''}`;
      }).join('\n');
      
      const structuredPrompt = `
${imageDescriptions}

요청사항: ${mainPrompt}`;

      console.log('Sending images to API:', {
        mainPrompt,
        imageOrder: uploadedImages.map((img, idx) => ({
          position: idx + 1,
          description: img.description,
          isMain: img.isMain
        })),
        imageCount: uploadedImages.length
      });

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: structuredPrompt,
          referenceImage: referenceImage,
          previousImages: previousImages
        }),
        cache: 'no-cache'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      setResult({
        imageUrl: data.imageUrl || null,
        text: data.text || '',
        type: data.imageUrl ? 'generated_image' : 'text_only'
      });
      
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [images, mainPrompt]);

  const downloadImage = () => {
    if (!result?.imageUrl) return;
    
    const link = document.createElement('a');
    link.href = result.imageUrl;
    link.download = `multi-image-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Header */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6 mt-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              다중 이미지 생성기
            </h1>
            <nav className="flex gap-4">
              <Link href="/" className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                단일 이미지 생성기
              </Link>
              <Link href="/multi-image" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
                다중 이미지 생성기
              </Link>
            </nav>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <p className="text-center text-gray-600 mb-8">
            여러 이미지를 참조하여 새로운 이미지를 생성합니다 (최대 5개)
          </p>

          {/* Active Image Count */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800 font-medium">
              현재 업로드된 이미지: {activeImageCount} / 5
            </p>
          </div>

          {/* Image Upload Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {images.map((image, index) => (
              <div 
                key={image.id} 
                className={`border-2 border-dashed rounded-lg p-4 transition-all ${
                  image.isMain && image.file 
                    ? 'border-blue-500 bg-blue-50' 
                    : dragActive[image.id] 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-300 hover:border-indigo-400'
                }`}
                onDragEnter={(e) => handleDrag(e, image.id)}
                onDragLeave={(e) => handleDrag(e, image.id)}
                onDragOver={(e) => handleDrag(e, image.id)}
                onDrop={(e) => handleDrop(e, image.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      이미지 {index + 1}
                    </span>
                    {image.isMain && image.file && (
                      <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">메인</span>
                    )}
                  </div>
                  {image.file && (
                    <div className="flex gap-2">
                      {!image.isMain && (
                        <button
                          onClick={() => setAsMainImage(image.id)}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                          메인으로
                        </button>
                      )}
                      <button
                        onClick={() => removeImage(image.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        제거
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Image Description */}
                <input
                  type="text"
                  value={image.description}
                  onChange={(e) => handleDescriptionChange(image.id, e.target.value)}
                  placeholder="용도 설명 (예: 스타일 참조)"
                  className="w-full mb-2 px-2 py-1 text-sm border rounded"
                />

                {/* Image Upload */}
                <input
                  ref={(ref) => { fileInputRefs.current[image.id] = ref; }}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(image.id, file);
                  }}
                  className="hidden"
                />
                
                {image.file ? (
                  <div className="space-y-2">
                    <img 
                      src={image.file} 
                      alt={`참조 이미지 ${index + 1}`}
                      className="w-full h-32 object-cover rounded"
                    />
                    <textarea
                      value={image.prompt}
                      onChange={(e) => handlePromptChange(image.id, e.target.value)}
                      placeholder="이 이미지에 대한 설명..."
                      className="w-full px-2 py-1 text-sm border rounded resize-none"
                      rows={2}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRefs.current[image.id]?.click()}
                    className={`w-full h-32 flex items-center justify-center rounded transition ${
                      dragActive[image.id]
                        ? 'bg-indigo-100'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-center">
                      {dragActive[image.id] ? (
                        <>
                          <svg className="mx-auto h-12 w-12 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-sm text-indigo-600 font-medium">이미지를 놓아주세요</span>
                        </>
                      ) : (
                        <>
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-sm text-gray-600">이미지 추가</span>
                          <span className="text-xs text-gray-400 mt-1 block">클릭 또는 드래그 앤 드롭</span>
                        </>
                      )}
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Main Prompt */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  메인 프롬프트
                </label>
                <span className={`text-sm ${mainPrompt.length > MAX_PROMPT_LENGTH ? 'text-red-600' : 'text-gray-500'}`}>
                  {mainPrompt.length} / {MAX_PROMPT_LENGTH}
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={MAX_PROMPT_LENGTH + 100}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition ${
                  mainPrompt.length > MAX_PROMPT_LENGTH ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="생성하고 싶은 최종 이미지를 설명해주세요..."
                value={mainPrompt}
                onChange={(e) => setMainPrompt(e.target.value)}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={generateImage}
              disabled={loading || mainPrompt.length > MAX_PROMPT_LENGTH || activeImageCount === 0}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium py-3 px-6 rounded-lg hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  생성 중...
                </span>
              ) : (
                '이미지 생성'
              )}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Result Display */}
          {result && (
            <div className="mt-6 p-6 bg-gray-50 rounded-lg">
              <h2 className="text-lg font-semibold mb-3 text-gray-800">생성 결과</h2>
              
              {result.type === 'generated_image' && result.imageUrl ? (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <img 
                      src={result.imageUrl} 
                      alt="Generated image" 
                      className="w-full h-auto rounded-lg shadow-lg"
                    />
                  </div>
                  
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
                  
                  {result.text && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">{result.text}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <p className="text-gray-700 whitespace-pre-wrap">{result.text}</p>
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