import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Game } from '@/types';
import { GameCard } from '@/components/GameCard';

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

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

// Mock BlurhashPlaceholder since it depends on canvas
vi.mock('@/components/BlurhashPlaceholder', () => ({
  BlurhashPlaceholder: ({ alt }: { alt: string }) => (
    <div data-testid="blurhash-placeholder">{alt}</div>
  ),
}));

function createMockGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    title: 'Super Mario Bros.',
    system_id: 'nes',
    rom_path: '/roms/smb.nes',
    rom_hash_crc32: null,
    rom_hash_sha1: null,
    file_size_bytes: null,
    file_last_modified: null,
    nointro_name: null,
    region: null,
    igdb_id: null,
    developer: null,
    publisher: null,
    release_date: null,
    genre: null,
    description: null,
    cover_path: null,
    blurhash: null,
    total_playtime_seconds: 0,
    last_played_at: null,
    currently_playing: false,
    is_favorite: false,
    date_added: '2024-01-01T00:00:00Z',
    metadata_source: null,
    metadata_fetched_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('GameCard', () => {
  it('renders game title', () => {
    render(<GameCard game={createMockGame()} />);
    expect(screen.getByText('Super Mario Bros.')).toBeInTheDocument();
  });

  it('renders system badge with system_id', () => {
    render(<GameCard game={createMockGame({ system_id: 'snes' })} />);
    expect(screen.getByText('snes')).toBeInTheDocument();
  });

  it('renders developer and year when available', () => {
    const game = createMockGame({
      developer: 'Nintendo',
      release_date: '1985-09-13',
    });
    render(<GameCard game={game} />);
    // Subtitle should contain both pieces joined by middle dot
    expect(screen.getByText(/Nintendo/)).toBeInTheDocument();
    expect(screen.getByText(/1985/)).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const game = createMockGame();
    render(<GameCard game={game} onClick={handleClick} />);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledWith(game);
  });

  it('handles keyboard interaction with Enter key', () => {
    const handleClick = vi.fn();
    const game = createMockGame();
    render(<GameCard game={game} onClick={handleClick} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledWith(game);
  });

  it('handles keyboard interaction with Space key', () => {
    const handleClick = vi.fn();
    const game = createMockGame();
    render(<GameCard game={game} onClick={handleClick} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });
    expect(handleClick).toHaveBeenCalledWith(game);
  });

  it('renders placeholder SVG when no cover_path', () => {
    const { container } = render(<GameCard game={createMockGame()} />);
    // Should render the SVG placeholder icon, not the BlurhashPlaceholder
    expect(screen.queryByTestId('blurhash-placeholder')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders BlurhashPlaceholder when cover_path is set', () => {
    const game = createMockGame({ cover_path: '/covers/smb.png' });
    render(<GameCard game={game} />);
    expect(screen.getByTestId('blurhash-placeholder')).toBeInTheDocument();
  });

  it('has accessible aria-label', () => {
    render(<GameCard game={createMockGame()} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Super Mario Bros. \u2014 nes',
    );
  });
});
