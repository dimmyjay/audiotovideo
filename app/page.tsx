'use client';

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Paystack to avoid SSR issues
const PaystackInline = typeof window !== 'undefined'
  ? require('@paystack/inline-js').default
  : null;

const PIXABAY_API_KEY = process.env.NEXT_PUBLIC_PIXABAY_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

const VIDEO_CATEGORIES = [
  {
    name: "Nature",
    subcategories: ["Forest", "Ocean", "Mountains", "Rain", "Sunset", "Wildlife", "Flowers"]
  },
  {
    name: "Travel",
    subcategories: ["Beach", "Airport", "Road Trip", "Backpacking", "Landmarks", "Countryside", "Adventure"]
  },
  {
    name: "Technology",
    subcategories: ["AI", "Robotics", "Coding", "Gadgets", "Futuristic", "Data", "Cybersecurity"]
  },
  {
    name: "Animals",
    subcategories: ["Dogs", "Cats", "Birds", "Wildlife", "Underwater", "Farm", "Insects"]
  },
  {
    name: "People",
    subcategories: ["Dancing", "Celebration", "Work", "Family", "Street", "Portrait", "Emotions"]
  },
  {
    name: "Backgrounds",
    subcategories: ["Abstract Loop", "Particles", "Geometric", "Bokeh", "Gradient", "Dark", "Minimal"]
  },
  {
    name: "Food",
    subcategories: ["Cooking", "Fruits", "Desserts", "Street Food", "Drinks", "Restaurant", "Fresh"]
  },
  {
    name: "Sports",
    subcategories: ["Football", "Basketball", "Running", "Gym", "Tennis", "Extreme", "Olympics"]
  },
  {
    name: "Music",
    subcategories: ["Concert", "DJ", "Instruments", "Studio", "Festival", "Vinyl", "Headphones"]
  },
  {
    name: "Business",
    subcategories: ["Office", "Meeting", "Startup", "Finance", "Handshake", "Graph", "Teamwork"]
  },
  {
    name: "Abstract",
    subcategories: ["Fluid", "Light Trails", "Digital Art", "Fractal", "Motion Graphics", "Glitch", "Neon"]
  },
  {
    name: "City",
    subcategories: ["Skyline", "Nightlife", "Traffic", "Architecture", "Urban", "Subway", "Rainy Street"]
  },
  {
    name: "Art",
    subcategories: ["Painting", "Sculpture", "Digital Art", "Gallery", "Street Art", "Animation", "Canvas"]
  },
  {
    name: "Education",
    subcategories: ["Classroom", "Books", "Science Lab", "Online Learning", "Graduation", "Writing", "Library"]
  },
  {
    name: "Fashion",
    subcategories: ["Runway", "Street Style", "Accessories", "Makeup", "Photoshoot", "Vintage", "Haute Couture"]
  },
  {
    name: "Medical",
    subcategories: ["Hospital", "Doctor", "Surgery", "Pills", "Health", "Microscope", "First Aid"]
  },
  {
    name: "Science",
    subcategories: ["Space", "Chemistry", "Physics", "Biology", "Lab", "DNA", "Telescope"]
  },
  {
    name: "Religion",
    subcategories: ["Church", "Mosque", "Temple", "Prayer", "Candles", "Scripture", "Meditation"]
  }
];

type PixabayVideo = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  videos: {
    large: { url: string; width: number; height: number; size: number };
    medium: { url: string; width: number; height: number; size: number };
    small: { url: string; width: number; height: number; size: number };
    tiny: { url: string; width: number; height: number; size: number };
  };
  picture_id: string;
  user: string;
};

export default function Home() {
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicVideoUrl, setMusicVideoUrl] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Paystack ONLY on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      document.body.appendChild(script);
      return () => {
        document.body.removeChild(script);
      };
    }
  }, []);

  const toggleSubcategory = (sub: string) => {
    setSelectedSubcategories(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
  };

  async function fetchAnimatedVideos(queries: string[]): Promise<string[]> {
    if (!PIXABAY_API_KEY) throw new Error('Pixabay API key is missing');
    const results: string[] = [];
    for (const query of queries) {
      try {
        const response = await fetch(
          `https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&safesearch=true&per_page=3`
        );
        if (!response.ok) continue;
        const data = await response.json();
        if (!data.hits || data.hits.length === 0) continue;
        const vid: PixabayVideo = data.hits[0];
        const url =
          vid.videos.medium?.url ||
          vid.videos.small?.url ||
          vid.videos.large?.url ||
          vid.videos.tiny?.url;
        if (url && !results.includes(url)) {
          results.push(url);
        }
      } catch (err) {
        console.warn(`Failed to fetch videos for: ${query}`, err);
      }
    }
    if (results.length === 0) throw new Error("No videos found.");
    return results;
  }

  async function muxToMusicVideo(videoUrls: string[], audioFile: File): Promise<Blob> {
    const videoFiles = await Promise.all(
      videoUrls.map(async (url, i) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new File([blob], `video${i}.mp4`);
      })
    );
    const formData = new FormData();
    videoFiles.forEach((file, i) => formData.append(`video${i}`, file, file.name));
    formData.append('audio', audioFile, audioFile.name);

    const response = await fetch('/api/mux', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      try {
        const data = await response.json();
        throw new Error(data?.error || 'Muxing failed');
      } catch {
        throw new Error('Muxing failed (unknown server error)');
      }
    }

    return await response.blob();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMusicVideoUrl(null);

    try {
      if (!audio) throw new Error('Please upload audio');
      if (selectedSubcategories.length === 0) throw new Error('Select at least one subcategory');

      const videoUrls = await fetchAnimatedVideos(selectedSubcategories);
      const muxedBlob = await muxToMusicVideo(videoUrls, audio);
      const muxedUrl = URL.createObjectURL(muxedBlob);
      setMusicVideoUrl(muxedUrl);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  const handleDownloadWithPayment = () => {
    if (!musicVideoUrl || !PAYSTACK_PUBLIC_KEY) return;

    const email = prompt('Enter your email for payment receipt:');
    if (!email) return;

    setIsProcessingPayment(true);

    // Only call Paystack on client
    if (typeof window !== 'undefined' && PaystackInline) {
      const handler = PaystackInline.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: 1500 * 100,
        currency: 'NGN',
        ref: `audio2video_${Date.now()}`,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money'],
        callback: async (response: any) => {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: response.reference }),
          });

          if (verifyRes.ok) {
            const link = document.createElement('a');
            link.href = musicVideoUrl;
            link.download = `musicvideo_${new Date().getTime()}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } else {
            const errorText = await verifyRes.text();
            alert(`Payment failed: ${errorText}`);
          }
          setIsProcessingPayment(false);
        },
        onClose: () => {
          setIsProcessingPayment(false);
          alert('Payment cancelled.');
        },
      });
      handler.openIframe();
    } else {
      alert('Payment system not loaded. Please refresh.');
      setIsProcessingPayment(false);
    }
  };

  const currentCategory = VIDEO_CATEGORIES.find(cat => cat.name === selectedMainCategory);

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-white/50 p-6 md:p-8">
        <div className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-transparent bg-clip-text">
            Audio2Video AI
          </h1>
          <p className="text-slate-600 mt-2">Select a category, choose sub-themes, and create your video!</p>
        </div>

        {/* Step 1: Choose Main Category */}
        {!selectedMainCategory ? (
          <div className="mb-6">
            <h2 className="font-bold text-slate-800 mb-3">1. Choose a Main Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VIDEO_CATEGORIES.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedMainCategory(cat.name)}
                  className="py-2 px-3 text-sm bg-gray-100 hover:bg-violet-100 rounded-lg transition text-slate-700"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            {/* Step 2: Choose Subcategories */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setSelectedMainCategory(null)}
                className="text-violet-600 hover:text-violet-800 text-sm"
              >
                ← Back
              </button>
              <h2 className="font-bold text-slate-800">
                2. Choose Sub-themes for <span className="text-violet-600">{selectedMainCategory}</span>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentCategory?.subcategories.map(sub => (
                <button
                  key={sub}
                  onClick={() => toggleSubcategory(sub)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${selectedSubcategories.includes(sub)
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                    }`}
                >
                  {sub}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Selected: {selectedSubcategories.length} sub-themes
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block font-semibold text-slate-800 mb-2">Upload Your Audio</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept="audio/*"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAudio(file);
                    setAudioUrl(file ? URL.createObjectURL(file) : null);
                  }}
                  className="hidden"
                  required
                />
                <div className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center">
                  {audio ? (
                    <span className="text-fuchsia-600 font-medium">{audio.name}</span>
                  ) : (
                    <span className="text-slate-500">Click to upload MP3/WAV</span>
                  )}
                </div>
              </label>
              {audio && (
                <audio controls src={audioUrl ?? undefined} className="w-full sm:w-auto h-10 rounded-lg" />
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || selectedSubcategories.length === 0}
            className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white font-bold rounded-xl disabled:opacity-70"
          >
            {loading ? 'Creating Video...' : '✨ Create Music Video'}
          </button>
        </form>

        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-center text-sm">{error}</div>}

        {musicVideoUrl && (
          <div className="mt-6">
            <h3 className="font-bold text-green-700 text-center mb-2">✅ Video Ready!</h3>
            <video
              src={musicVideoUrl}
              controls
              controlsList="nodownload"
              className="w-full rounded-xl shadow"
              style={{ maxHeight: '300px' }}
            />
            <button
              onClick={handleDownloadWithPayment}
              disabled={isProcessingPayment}
              className="mt-3 w-full py-2.5 bg-amber-500 text-white font-bold rounded-lg"
            >
              {isProcessingPayment ? 'Processing...' : '💰 Pay ₦1,500 to Download'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
