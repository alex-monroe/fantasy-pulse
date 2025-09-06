'use server';

/**
 * @fileOverview Analyzes the live game situation and provides a likely scenario of upcoming plays.
 *
 * - analyzeLiveGame - A function that handles the live game analysis process.
 * - LiveGameAnalysisInput - The input type for the analyzeLiveGame function.
 * - LiveGameAnalysisOutput - The return type for the analyzeLiveGame function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LiveGameAnalysisInputSchema = z.object({
  score: z.string().describe('The current score of the game (e.g., Team A 21 - Team B 14).'),
  timeRemaining: z.string().describe('The time remaining in the game (e.g., 5:30 in the 4th quarter).'),
  fieldPosition: z.string().describe('The current field position (e.g., Team A at their own 30-yard line).'),
});
export type LiveGameAnalysisInput = z.infer<typeof LiveGameAnalysisInputSchema>;

const LiveGameAnalysisOutputSchema = z.object({
  likelyScenario: z
    .string()
    .describe('A likely scenario of upcoming plays based on the game situation.'),
});
export type LiveGameAnalysisOutput = z.infer<typeof LiveGameAnalysisOutputSchema>;

export async function analyzeLiveGame(input: LiveGameAnalysisInput): Promise<LiveGameAnalysisOutput> {
  return analyzeLiveGameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'liveGameAnalysisPrompt',
  input: {schema: LiveGameAnalysisInputSchema},
  output: {schema: LiveGameAnalysisOutputSchema},
  prompt: `You are an expert football analyst providing insights on live game situations for fantasy football players.

  Based on the current game situation, provide a likely scenario of upcoming plays.
  Consider the score, time remaining, and field position to predict the offensive and defensive strategies.

  Score: {{{score}}}
  Time Remaining: {{{timeRemaining}}}
  Field Position: {{{fieldPosition}}}

  Likely Scenario:`,
});

const analyzeLiveGameFlow = ai.defineFlow(
  {
    name: 'analyzeLiveGameFlow',
    inputSchema: LiveGameAnalysisInputSchema,
    outputSchema: LiveGameAnalysisOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
