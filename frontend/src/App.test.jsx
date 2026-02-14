import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./api', () => ({
  fetchVolumeData: vi.fn(),
}));

vi.mock('./components/Uploader', () => ({
  default: function MockUploader() {
    return <div data-testid="uploader">Uploader</div>;
  },
}));

vi.mock('./components/Viewer3D', () => ({
  default: function MockViewer3D() {
    return <div data-testid="viewer3d">Viewer3D</div>;
  },
}));

vi.mock('./components/SliceViewer2D', () => ({
  default: function MockSliceViewer2D({ viewType }) {
    return <div data-testid={`slice-${viewType}`}>Slice {viewType}</div>;
  },
}));

vi.mock('./components/Controls', () => ({
  default: function MockControls() {
    return <div data-testid="controls">Controls</div>;
  },
}));

describe('App', () => {
  it('renders ROI toggle button in header', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /roi: off/i })).toBeInTheDocument();
  });

  it('toggles ROI mode from OFF to ON', () => {
    render(<App />);

    const toggle = screen.getByRole('button', { name: /roi: off/i });
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /roi: on/i })).toBeInTheDocument();
  });
});
