import { render, screen } from '@testing-library/react';
import { BlurhashPlaceholder } from '@/components/BlurhashPlaceholder';

// Mock the blurhash decode function since jsdom lacks full canvas support
vi.mock('blurhash', () => ({
  decode: vi.fn(() => new Uint8ClampedArray(32 * 32 * 4)),
}));

// Provide a minimal canvas 2d context mock
const mockPutImageData = vi.fn();
const mockCreateImageData = vi.fn(() => ({
  data: new Uint8ClampedArray(32 * 32 * 4),
  set: vi.fn(),
}));

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    putImageData: mockPutImageData,
    createImageData: mockCreateImageData,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('BlurhashPlaceholder', () => {
  it('renders a canvas element when given a valid blurhash', () => {
    const { container } = render(
      <BlurhashPlaceholder blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj" width={300} height={300} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('renders a fallback div when blurhash is empty', () => {
    render(
      <BlurhashPlaceholder blurhash="" width={300} height={300} alt="fallback" />,
    );
    const fallback = screen.getByRole('img');
    expect(fallback.tagName).toBe('DIV');
    expect(fallback).toHaveAttribute('aria-label', 'fallback');
  });

  it('renders an img element when src prop is provided', () => {
    const { container } = render(
      <BlurhashPlaceholder
        blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
        width={300}
        height={300}
        src="/covers/game.png"
        alt="Game cover"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/covers/game.png');
    expect(img).toHaveAttribute('alt', 'Game cover');
  });

  it('has correct role="img" ARIA attribute', () => {
    render(
      <BlurhashPlaceholder
        blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
        width={200}
        height={200}
        alt="Test image"
      />,
    );
    const element = screen.getByRole('img');
    expect(element).toHaveAttribute('aria-label', 'Test image');
  });

  it('applies width and height as inline styles', () => {
    render(
      <BlurhashPlaceholder blurhash="" width={400} height={250} alt="sized" />,
    );
    const el = screen.getByRole('img');
    expect(el.style.width).toBe('400px');
    expect(el.style.height).toBe('250px');
  });

  it('does not render img element when src is not provided', () => {
    const { container } = render(
      <BlurhashPlaceholder
        blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
        width={300}
        height={300}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
