import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '@/components/EmptyState';

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

const TestIcon = () => <svg data-testid="test-icon" />;

describe('EmptyState', () => {
  it('renders title, description, and icon', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No games found"
        description="Add some ROMs to get started."
      />,
    );
    expect(screen.getByText('No games found')).toBeInTheDocument();
    expect(screen.getByText('Add some ROMs to get started.')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders primary action button when actionLabel and onAction provided', () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
        actionLabel="Scan Now"
        onAction={handleAction}
      />,
    );
    expect(screen.getByRole('button', { name: 'Scan Now' })).toBeInTheDocument();
  });

  it('renders secondary action button when secondaryActionLabel and onSecondaryAction provided', () => {
    const handleSecondary = vi.fn();
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
        secondaryActionLabel="Learn More"
        onSecondaryAction={handleSecondary}
      />,
    );
    expect(screen.getByRole('button', { name: 'Learn More' })).toBeInTheDocument();
  });

  it('does NOT render action buttons when no action props given', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onAction when primary button clicked', async () => {
    const user = userEvent.setup();
    const handleAction = vi.fn();
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
        actionLabel="Go"
        onAction={handleAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('calls onSecondaryAction when secondary button clicked', async () => {
    const user = userEvent.setup();
    const handleSecondary = vi.fn();
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
        secondaryActionLabel="Cancel"
        onSecondaryAction={handleSecondary}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders with "inline" variant (smaller styling)', () => {
    const { container } = render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
        variant="inline"
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('py-6');
    expect(wrapper).toHaveClass('gap-2');
  });

  it('renders with "page" variant (default, larger styling)', () => {
    const { container } = render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
        description="Nothing here"
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('py-24');
    expect(wrapper).toHaveClass('gap-3');
  });
});
