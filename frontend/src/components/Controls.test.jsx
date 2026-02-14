import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Controls from './Controls';

vi.mock('../utils/ROIManager', () => ({
  default: {
    subscribe: vi.fn(() => () => {}),
    clearROI: vi.fn(),
    calculateVOIStatistics: vi.fn(() => null),
  },
}));

describe('Controls', () => {
  it('shows ROI toggle label based on enabled state', () => {
    render(
      <Controls
        onWindowLevelChange={vi.fn()}
        imageData={null}
        windowLevel={{ window: 400, level: 40 }}
        roiDrawingEnabled={false}
        onRoiDrawingToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /enable roi draw/i })).toBeInTheDocument();
  });

  it('calls onRoiDrawingToggle when ROI toggle button is clicked', () => {
    const onRoiDrawingToggle = vi.fn();

    render(
      <Controls
        onWindowLevelChange={vi.fn()}
        imageData={null}
        windowLevel={{ window: 400, level: 40 }}
        roiDrawingEnabled={false}
        onRoiDrawingToggle={onRoiDrawingToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /enable roi draw/i }));

    expect(onRoiDrawingToggle).toHaveBeenCalledWith(true);
  });

  it('calls window/level callback when slider values change', () => {
    const onWindowLevelChange = vi.fn();

    render(
      <Controls
        onWindowLevelChange={onWindowLevelChange}
        imageData={null}
        windowLevel={{ window: 400, level: 40 }}
        roiDrawingEnabled={true}
        onRoiDrawingToggle={vi.fn()}
      />,
    );

    const sliders = screen.getAllByRole('slider');

    fireEvent.change(sliders[0], { target: { value: '500' } });
    fireEvent.change(sliders[1], { target: { value: '20' } });

    expect(onWindowLevelChange).toHaveBeenCalledWith({ window: 500, level: 40 });
    expect(onWindowLevelChange).toHaveBeenCalledWith({ window: 400, level: 20 });
  });
});
