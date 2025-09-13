import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * The Genkit AI instance.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
});
