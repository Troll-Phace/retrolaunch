import { useRef, useEffect, useState } from "react";
import { decode } from "blurhash";

export interface BlurhashPlaceholderProps {
  blurhash: string;
  width: number;
  height: number;
  /** When provided, crossfade to real image once loaded. */
  src?: string;
  alt?: string;
  className?: string;
}

const DECODE_WIDTH = 32;
const DECODE_HEIGHT = 32;

export function BlurhashPlaceholder({
  blurhash,
  width,
  height,
  src,
  alt = "",
  className = "",
}: BlurhashPlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);

  // Decode blurhash and paint to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blurhash) {
      setDecodeFailed(true);
      return;
    }

    try {
      const pixels = decode(blurhash, DECODE_WIDTH, DECODE_HEIGHT);
      canvas.width = DECODE_WIDTH;
      canvas.height = DECODE_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setDecodeFailed(true);
        return;
      }
      const imageData = ctx.createImageData(DECODE_WIDTH, DECODE_HEIGHT);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
      setDecodeFailed(false);
    } catch {
      setDecodeFailed(true);
    }
  }, [blurhash]);

  // Load real image in background when src is provided
  useEffect(() => {
    if (!src) {
      setImageLoaded(false);
      return;
    }

    setImageLoaded(false);
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageLoaded(false);
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  // Fallback: empty/invalid blurhash
  if (!blurhash || decodeFailed) {
    return (
      <div
        className={`bg-elevated ${className}`}
        style={{ width, height }}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ width, height }}
      role="img"
      aria-label={alt}
    >
      {/* Blurhash canvas — fades out when real image loads */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: imageLoaded ? 0 : 1 }}
      />

      {/* Real image — fades in once loaded */}
      {src && (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: imageLoaded ? 1 : 0 }}
          loading="lazy"
        />
      )}
    </div>
  );
}
