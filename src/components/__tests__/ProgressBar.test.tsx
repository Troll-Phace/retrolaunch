import { render, screen } from '@testing-library/react';
import { ProgressBar } from '@/components/ProgressBar';

describe('ProgressBar', () => {
  it('renders with role="progressbar" and correct ARIA attributes', () => {
    render(<ProgressBar value={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders with value 0 showing 0% fill width', () => {
    render(<ProgressBar value={0} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('renders with value 50 showing 50% fill width', () => {
    render(<ProgressBar value={50} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('renders with value 100 showing 100% fill width', () => {
    render(<ProgressBar value={100} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('clamps values below 0 to 0%', () => {
    render(<ProgressBar value={-20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('clamps values above 100 to 100%', () => {
    render(<ProgressBar value={150} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('applies custom height via style', () => {
    render(<ProgressBar value={50} height={12} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.style.height).toBe('12px');
  });
});
