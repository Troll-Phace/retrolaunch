import { render, screen } from '@testing-library/react';
import { StatusIndicator, type StatusState } from '@/components/StatusIndicator';

describe('StatusIndicator', () => {
  const allStatuses: StatusState[] = [
    'configured',
    'scanning',
    'not_configured',
    'error',
    'matched',
  ];

  it('renders all 5 status states without error', () => {
    for (const status of allStatuses) {
      const { unmount } = render(<StatusIndicator status={status} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    }
  });

  it('each state renders an SVG icon', () => {
    for (const status of allStatuses) {
      const { container, unmount } = render(<StatusIndicator status={status} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      unmount();
    }
  });

  it('renders optional label text', () => {
    render(<StatusIndicator status="configured" label="Ready" />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<StatusIndicator status="error" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses aria-label from config when no label is provided', () => {
    render(<StatusIndicator status="error" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Error');
  });

  it('uses custom label as aria-label when provided', () => {
    render(<StatusIndicator status="scanning" label="In progress" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'In progress');
  });

  it('applies color classes per status', () => {
    const { unmount: u1 } = render(<StatusIndicator status="configured" />);
    expect(screen.getByRole('status')).toHaveClass('text-success');
    u1();

    const { unmount: u2 } = render(<StatusIndicator status="error" />);
    expect(screen.getByRole('status')).toHaveClass('text-error');
    u2();
  });
});
