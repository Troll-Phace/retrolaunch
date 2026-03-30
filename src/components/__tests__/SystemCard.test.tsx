import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { System } from '@/types';
import { SystemCard } from '@/components/SystemCard';

// Mock framer-motion to render plain divs
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      onHoverStart: _onHS,
      onHoverEnd: _onHE,
      whileHover: _wh,
      transition: _t,
      ...rest
    }: Record<string, unknown>) => <div {...rest}>{children as React.ReactNode}</div>,
  },
  useReducedMotion: () => false,
}));

function createMockSystem(overrides: Partial<System> = {}): System {
  return {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    manufacturer: 'Nintendo',
    short_name: 'NES',
    generation: 3,
    extensions: ['nes'],
    header_offset: 0,
    header_magic: '4e45531a',
    theme_color: null,
    ...overrides,
  };
}

describe('SystemCard', () => {
  it('renders system name', () => {
    render(<SystemCard system={createMockSystem()} gameCount={42} />);
    expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
  });

  it('renders game count number', () => {
    render(<SystemCard system={createMockSystem()} gameCount={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders "games" label text', () => {
    render(<SystemCard system={createMockSystem()} gameCount={10} />);
    expect(screen.getByText('games')).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const system = createMockSystem();
    render(<SystemCard system={system} gameCount={5} onClick={handleClick} />);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledWith(system);
  });

  it('handles keyboard interaction with Enter key', () => {
    const handleClick = vi.fn();
    const system = createMockSystem();
    render(<SystemCard system={system} gameCount={5} onClick={handleClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledWith(system);
  });

  it('applies system theme color to the game count when provided', () => {
    const system = createMockSystem({ theme_color: '#e60012' });
    render(<SystemCard system={system} gameCount={99} />);
    const countElement = screen.getByText('99');
    expect(countElement.style.color).toBe('rgb(230, 0, 18)');
  });

  it('uses default accent class when no theme_color', () => {
    render(<SystemCard system={createMockSystem()} gameCount={7} />);
    const countElement = screen.getByText('7');
    expect(countElement).toHaveClass('text-accent');
    expect(countElement.style.color).toBe('');
  });

  it('has accessible aria-label with name and count', () => {
    render(<SystemCard system={createMockSystem()} gameCount={42} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Nintendo Entertainment System \u2014 42 games',
    );
  });
});
