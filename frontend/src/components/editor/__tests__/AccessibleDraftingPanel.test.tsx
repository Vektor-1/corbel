// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AccessibleDraftingPanel } from '../AccessibleDraftingPanel';
import type { Wall } from '@/types/design';

function createTestWall(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'test-wall-1',
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 3000, y: 0 },
    thickness: 225,
    material: 'sandcrete',
    type: 'loadBearing',
    height: 2700,
    ...overrides,
  };
}

function renderPanel(overrides = {}) {
  const onAddWall = vi.fn();
  const onAddOpening = vi.fn();
  const defaultProps = {
    walls: [] as Wall[],
    selectedWall: null as Wall | null,
    onAddWall,
    onAddOpening,
  };
  const result = render(
    <AccessibleDraftingPanel {...defaultProps} {...overrides} />,
  );
  return { ...result, onAddWall, onAddOpening };
}

describe('AccessibleDraftingPanel', () => {
  describe('baseline accessibility', () => {
    it('renders with no axe violations', async () => {
      const { container } = renderPanel();
      expect((await axe(container)).violations).toEqual([]);
    });
  });

  describe('wall form', () => {
    it('entering valid wall coordinates via keyboard and submitting calls onAddWall with parsed numbers', async () => {
      const { onAddWall } = renderPanel();
      const user = userEvent.setup();

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const startYInput = screen.getByRole('textbox', { name: /start y/i });
      const endXInput = screen.getByRole('textbox', { name: /end x/i });
      const endYInput = screen.getByRole('textbox', { name: /end y/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      await user.clear(startXInput);
      await user.type(startXInput, '100');

      await user.clear(startYInput);
      await user.type(startYInput, '200');

      await user.clear(endXInput);
      await user.type(endXInput, '1000');

      await user.clear(endYInput);
      await user.type(endYInput, '500');

      await user.click(submitButton);

      expect(onAddWall).toHaveBeenCalledOnce();
      expect(onAddWall).toHaveBeenCalledWith({
        startX: 100,
        startY: 200,
        endX: 1000,
        endY: 500,
      });
    });

    it('submitting wall form with Enter key on focused submit button calls onAddWall', async () => {
      const { onAddWall } = renderPanel();
      const user = userEvent.setup();

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const endXInput = screen.getByRole('textbox', { name: /end x/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      await user.clear(startXInput);
      await user.type(startXInput, '50');

      await user.clear(endXInput);
      await user.type(endXInput, '750');

      // Focus the submit button and press Enter
      submitButton.focus();
      await user.keyboard('{Enter}');

      expect(onAddWall).toHaveBeenCalledOnce();
      expect(onAddWall).toHaveBeenCalledWith({
        startX: 50,
        startY: 0,
        endX: 750,
        endY: 0,
      });
    });

    it('typing non-numeric value and submitting shows validation message and does not call onAddWall', async () => {
      const { onAddWall } = renderPanel();
      const user = userEvent.setup();

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      await user.clear(startXInput);
      await user.type(startXInput, 'abc');

      await user.click(submitButton);

      expect(onAddWall).not.toHaveBeenCalled();
      const statusMessage = screen.getByText(/enter four numeric millimetre coordinates/i);
      expect(statusMessage).toBeDefined();
      expect(document.body.contains(statusMessage)).toBe(true);
    });

    it('after failed wall submission, invalid field carries aria-invalid="true" and valid field does not', async () => {
      renderPanel();
      const user = userEvent.setup();

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const startYInput = screen.getByRole('textbox', { name: /start y/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      await user.clear(startXInput);
      await user.type(startXInput, 'not-a-number');

      await user.click(submitButton);

      // Invalid field should have aria-invalid="true"
      expect(startXInput.getAttribute('aria-invalid')).toBe('true');

      // Valid field (startY still has default value '0') should have aria-invalid="false"
      expect(startYInput.getAttribute('aria-invalid')).toBe('false');
    });

    it('correcting an invalid field after failed submission clears its aria-invalid reactively', async () => {
      renderPanel();
      const user = userEvent.setup();

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      // Make it invalid
      await user.clear(startXInput);
      await user.type(startXInput, 'invalid');

      await user.click(submitButton);

      // Should now be invalid
      expect(startXInput.getAttribute('aria-invalid')).toBe('true');

      // Correct it without clicking submit again
      await user.clear(startXInput);
      await user.type(startXInput, '500');

      // aria-invalid should be cleared reactively
      expect(startXInput.getAttribute('aria-invalid')).toBe('false');
    });
  });

  describe('opening form', () => {
    it('attempting to add opening with no selectedWall shows "select a host wall" message and does not call onAddOpening', async () => {
      const { onAddOpening } = renderPanel({ selectedWall: null });
      const user = userEvent.setup();

      const addOpeningButton = screen.getByRole('button', { name: /add door/i });

      await user.click(addOpeningButton);

      expect(onAddOpening).not.toHaveBeenCalled();
      const statusMessage = screen.getByText(/select a host wall in the outline/i);
      expect(statusMessage).toBeDefined();
      expect(document.body.contains(statusMessage)).toBe(true);
    });

    it('with a selectedWall provided and valid width/offset, submitting opening form calls onAddOpening with parsed kind/width/offset', async () => {
      const selectedWall = createTestWall();
      const { onAddOpening } = renderPanel({ selectedWall });
      const user = userEvent.setup();

      const typeSelect = screen.getByRole('combobox', { name: /type/i });
      const widthInput = screen.getByRole('textbox', { name: /width/i });
      const offsetInput = screen.getByRole('textbox', { name: /centre offset/i });
      const addOpeningButton = screen.getByRole('button', { name: /add door/i });

      // Set type to 'window'
      await user.selectOptions(typeSelect, 'window');

      // Set width and offset
      await user.clear(widthInput);
      await user.type(widthInput, '1200');

      await user.clear(offsetInput);
      await user.type(offsetInput, '1500');

      await user.click(addOpeningButton);

      expect(onAddOpening).toHaveBeenCalledOnce();
      expect(onAddOpening).toHaveBeenCalledWith('window', 1200, 1500);
    });

    it('opening form validates numeric inputs and shows validation message on failure', async () => {
      const selectedWall = createTestWall();
      const { onAddOpening } = renderPanel({ selectedWall });
      const user = userEvent.setup();

      const widthInput = screen.getByRole('textbox', { name: /width/i });
      const addOpeningButton = screen.getByRole('button', { name: /add door/i });

      await user.clear(widthInput);
      await user.type(widthInput, 'invalid-width');

      await user.click(addOpeningButton);

      expect(onAddOpening).not.toHaveBeenCalled();
      const statusMessage = screen.getByText(/enter a numeric opening width and centre offset/i);
      expect(statusMessage).toBeDefined();
      expect(document.body.contains(statusMessage)).toBe(true);
    });

    it('opening form shows success message from callback when provided', async () => {
      const selectedWall = createTestWall();
      const { onAddOpening } = renderPanel({ selectedWall });
      const user = userEvent.setup();

      // Mock onAddOpening to return a custom message
      onAddOpening.mockReturnValue('Custom success message');

      const addOpeningButton = screen.getByRole('button', { name: /add door/i });

      await user.click(addOpeningButton);

      const statusMessage = screen.getByText('Custom success message');
      expect(statusMessage).toBeDefined();
      expect(document.body.contains(statusMessage)).toBe(true);
    });

    it('opening form uses default success message when callback returns null', async () => {
      const selectedWall = createTestWall();
      const { onAddOpening } = renderPanel({ selectedWall });
      const user = userEvent.setup();

      // Mock onAddOpening to return null (use default message)
      onAddOpening.mockReturnValue(null);

      const addOpeningButton = screen.getByRole('button', { name: /add door/i });

      await user.click(addOpeningButton);

      const statusMessage = screen.getByText(/door added and selected/i);
      expect(statusMessage).toBeDefined();
      expect(document.body.contains(statusMessage)).toBe(true);
    });
  });

  describe('field-to-status association', () => {
    it('every coordinate/width/offset input is described by the shared status message', () => {
      renderPanel();

      const fields = [
        screen.getByRole('textbox', { name: /start x/i }),
        screen.getByRole('textbox', { name: /start y/i }),
        screen.getByRole('textbox', { name: /end x/i }),
        screen.getByRole('textbox', { name: /end y/i }),
        screen.getByRole('textbox', { name: /width/i }),
        screen.getByRole('textbox', { name: /centre offset/i }),
      ];
      const status = screen.getByText(/coordinate drafting is available/i);

      for (const field of fields) {
        expect(field.getAttribute('aria-describedby')).toBe(status.id);
      }
      expect(status.id).toBeTruthy();
    });
  });

  describe('aria-live status updates', () => {
    it('status message updates live as form interactions occur', async () => {
      const { onAddWall } = renderPanel();
      const user = userEvent.setup();

      // Get the status paragraph with aria-live="polite"
      const statusParagraph = screen.getByText(/coordinate drafting is available/i);
      expect(statusParagraph.getAttribute('aria-live')).toBe('polite');

      const startXInput = screen.getByRole('textbox', { name: /start x/i });
      const submitButton = screen.getByRole('button', { name: /add wall from coordinates/i });

      // Trigger validation error
      await user.clear(startXInput);
      await user.type(startXInput, 'xyz');
      await user.click(submitButton);

      // Check the status message changed
      const errorMessage = screen.getByText(/enter four numeric millimetre coordinates/i);
      expect(errorMessage).toBeDefined();

      // Fix it and submit again
      onAddWall.mockReturnValue(null);
      await user.clear(startXInput);
      await user.type(startXInput, '100');
      await user.click(submitButton);

      // Check the new success message
      const successMessage = screen.getByText(/wall added and selected/i);
      expect(successMessage).toBeDefined();
    });
  });
});
