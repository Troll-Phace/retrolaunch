import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
  });

  it('renders all four variants without error', () => {
    const variants = ['primary', 'secondary', 'ghost', 'icon'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
      unmount();
    }
  });

  it('fires onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Press</Button>);
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state with correct attributes and styling class', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
    expect(button).toHaveClass('disabled:cursor-not-allowed');
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>No-op</Button>);
    await user.click(screen.getByRole('button', { name: 'No-op' }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies correct size classes for each size', () => {
    const { unmount: u1 } = render(<Button size="sm">S</Button>);
    expect(screen.getByRole('button', { name: 'S' })).toHaveClass('h-8');
    u1();

    const { unmount: u2 } = render(<Button size="md">M</Button>);
    expect(screen.getByRole('button', { name: 'M' })).toHaveClass('h-[42px]');
    u2();

    const { unmount: u3 } = render(<Button size="lg">L</Button>);
    expect(screen.getByRole('button', { name: 'L' })).toHaveClass('h-[50px]');
    u3();
  });
});
