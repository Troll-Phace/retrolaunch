import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/Input';

describe('Input', () => {
  it('renders with placeholder text', () => {
    render(<Input placeholder="Search games..." />);
    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
  });

  it('fires onChange when typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input placeholder="Type here" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type here');
    await user.type(input, 'Mario');
    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue('Mario');
  });

  it('renders icon wrapper when icon prop is provided', () => {
    const icon = <span data-testid="search-icon">Q</span>;
    render(<Input icon={icon} placeholder="Search" />);
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('renders search variant with rounded-full by default', () => {
    render(<Input placeholder="default" />);
    expect(screen.getByPlaceholderText('default')).toHaveClass('rounded-full');
  });

  it('renders form variant with rounded-md', () => {
    render(<Input variant="form" placeholder="form" />);
    expect(screen.getByPlaceholderText('form')).toHaveClass('rounded-md');
  });

  it('does not render icon wrapper when no icon is provided', () => {
    const { container } = render(<Input placeholder="plain" />);
    // Without icon, the input is returned directly -- not wrapped in a div
    expect(container.querySelector('.relative')).toBeNull();
  });
});
