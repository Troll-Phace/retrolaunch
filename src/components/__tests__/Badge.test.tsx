import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/Badge';

describe('Badge', () => {
  it('renders the label text', () => {
    render(<Badge label="NES" />);
    expect(screen.getByText('NES')).toBeInTheDocument();
  });

  it('applies default accent styling when no color prop is provided', () => {
    render(<Badge label="Action" />);
    const badge = screen.getByText('Action');
    expect(badge).toHaveClass('text-accent');
    expect(badge).toHaveClass('bg-accent/15');
    expect(badge).toHaveClass('border-accent/50');
  });

  it('renders as a pill shape with rounded-full', () => {
    render(<Badge label="RPG" />);
    const badge = screen.getByText('RPG');
    expect(badge).toHaveClass('rounded-full');
  });

  it('applies custom color via inline style when color prop is provided', () => {
    render(<Badge label="SNES" color="#7b2ff7" />);
    const badge = screen.getByText('SNES');
    expect(badge.style.color).toBe('rgb(123, 47, 247)');
    expect(badge.style.backgroundColor).toContain('color-mix');
    expect(badge.style.borderColor).toContain('color-mix');
  });

  it('renders all variant props without error', () => {
    const variants = ['system', 'genre', 'status', 'region'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge label={variant} variant={variant} />);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it('appends custom className', () => {
    render(<Badge label="Test" className="mt-4" />);
    const badge = screen.getByText('Test');
    expect(badge).toHaveClass('mt-4');
  });
});
