import type { LessonStep } from './types';

export const TWO_BEDROOM_LESSON: LessonStep[] = [
  {
    id: 'entrance', number: 1, kind: 'plan-click', title: 'Find the entrance',
    prompt: 'Select the opening that brings someone into the home.',
    explanation: 'The main entrance is the external door at the bottom of the plan. It enters the living room.',
    nextAction: 'Look for an opening that connects the outside edge to an internal space.',
    remediation: 'Observe the plan perimeter first. An entrance crosses the outside boundary; internal doors only connect one room to another.',
  },
  {
    id: 'bedroom', number: 2, kind: 'multiple-choice', title: 'Identify a bedroom',
    prompt: 'Which labelled space is a bedroom?',
    choices: [
      { value: 'living', label: 'Living room' },
      { value: 'bedroom-one', label: 'Bedroom 1' },
      { value: 'kitchen', label: 'Kitchen' },
    ],
    explanation: 'Bedroom 1 is explicitly labelled and is separated from the public living area.',
    nextAction: 'Use labels, room boundaries, and nearby doors together—never one clue alone.',
    remediation: 'Inspect the room labels before guessing. Then check whether the room is separated from the shared living space by a door and wall.',
  },
  {
    id: 'area', number: 3, kind: 'numeric', title: 'Calculate area',
    prompt: 'Bedroom 1 is 3 m × 4 m. What is its area in m²?',
    explanation: 'Area = length × width: 3 m × 4 m = 12 m².',
    nextAction: 'For rectangular rooms, multiply the two internal dimensions and include m².',
    remediation: 'Write the two lengths first: 3 m and 4 m. Multiply them, rather than adding them, and report the result in square metres.',
  },
  {
    id: 'scale', number: 4, kind: 'plan-click', title: 'Find the scale reference',
    prompt: 'Select the wall marked 3 m. This is the known length used to set drawing scale.',
    explanation: 'A known wall length connects pixels on the image to real-world distance. Measure it before trusting areas.',
    nextAction: 'When retracing, select this wall and enter 3,000 mm to calibrate the drawing.',
    remediation: 'Look for a stated measurement, not just any line. The dimension label and its extension marks identify the wall whose real length is known.',
  },
];
