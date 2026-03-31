import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '@/components/ErrorState';

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

const CustomIcon = () => <svg data-testid="custom-icon" />;

describe('ErrorState', () => {
  it('renders title and description', () => {
    render(<ErrorState title="Something broke" description="Try again later." />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText('Try again later.')).toBeInTheDocument();
  });

  it('renders with role="alert" for accessibility', () => {
    render(<ErrorState title="Error" description="Oops" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders action button when actionLabel and onAction provided', () => {
    const handleAction = vi.fn();
    render(
      <ErrorState
        title="Error"
        description="Oops"
        actionLabel="Fix It"
        onAction={handleAction}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fix It' })).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    const handleRetry = vi.fn();
    render(
      <ErrorState title="Error" description="Oops" onRetry={handleRetry} />,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders both action and retry buttons together', () => {
    render(
      <ErrorState
        title="Error"
        description="Oops"
        actionLabel="Settings"
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onAction when action button clicked', async () => {
    const user = userEvent.setup();
    const handleAction = vi.fn();
    render(
      <ErrorState
        title="Error"
        description="Oops"
        actionLabel="Fix"
        onAction={handleAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Fix' }));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry when retry button clicked', async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();
    render(
      <ErrorState title="Error" description="Oops" onRetry={handleRetry} />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders inline variant with compact styling', () => {
    const { container } = render(
      <ErrorState title="Error" description="Oops" variant="inline" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('flex-row');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('px-4');
    expect(wrapper).toHaveClass('py-3');
  });

  it('renders fullPage variant (default) with centered layout', () => {
    const { container } = render(
      <ErrorState title="Error" description="Oops" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('flex-col');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('justify-center');
    expect(wrapper).toHaveClass('py-24');
    expect(wrapper).toHaveClass('text-center');
  });

  it('renders default warning icon when no custom icon provided', () => {
    const { container } = render(
      <ErrorState title="Error" description="Oops" />,
    );
    // The default WarningTriangleIcon renders an SVG with aria-hidden
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('renders custom icon when provided', () => {
    render(
      <ErrorState
        title="Error"
        description="Oops"
        icon={<CustomIcon />}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
