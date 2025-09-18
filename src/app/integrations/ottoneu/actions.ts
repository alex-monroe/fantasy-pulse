'use server';

import { createClient } from '@/utils/supabase/server';
import { JSDOM } from 'jsdom';

function normalizeTeamName(name: string) {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function findOttoneuTeamUrl(
  leagueUrl: string,
  teamName: string
): Promise<{ teamUrl: string } | { error: string }> {
  const trimmedTeamName = teamName.trim();
  if (!trimmedTeamName) {
    return { error: 'Team name is required.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(leagueUrl);
  } catch {
    return { error: 'Invalid Ottoneu league URL.' };
  }

  if (parsedUrl.hostname !== 'ottoneu.fangraphs.com') {
    return { error: 'Invalid Ottoneu league URL.' };
  }

  const pathMatch = parsedUrl.pathname.match(/^\/football\/(\d+)\/?$/);
  if (!pathMatch) {
    return { error: 'Invalid Ottoneu league URL.' };
  }

  parsedUrl.protocol = 'https:';
  parsedUrl.pathname = `/football/${pathMatch[1]}/`;
  parsedUrl.search = '';
  parsedUrl.hash = '';

  const normalizedTeamName = normalizeTeamName(trimmedTeamName);

  try {
    const res = await fetch(parsedUrl.toString());
    if (!res.ok) {
      return { error: 'Failed to fetch league page.' };
    }

    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const potentialLinks = Array.from(
      document.querySelectorAll('a[href*="/team/"]')
    );

    const exactMatch = potentialLinks.find((anchor) => {
      const text = normalizeTeamName(anchor.textContent || '');
      return text === normalizedTeamName;
    });

    const partialMatch = potentialLinks.find((anchor) => {
      const text = normalizeTeamName(anchor.textContent || '');
      return text.includes(normalizedTeamName);
    });

    const teamAnchor = exactMatch || partialMatch;
    if (!teamAnchor) {
      return { error: 'Could not find team in standings.' };
    }

    const href = teamAnchor.getAttribute('href') || '';
    if (!href) {
      return { error: 'Invalid team link found in standings.' };
    }

    let absoluteHref: string;
    try {
      absoluteHref = new URL(href, parsedUrl.toString()).toString();
    } catch {
      return { error: 'Invalid team link found in standings.' };
    }

    if (!/football\/\d+\/team\/\d+/.test(absoluteHref)) {
      return { error: 'Invalid team link found in standings.' };
    }

    return { teamUrl: absoluteHref };
  } catch {
    return { error: 'Failed to fetch league page.' };
  }
}

/**
 * Fetches and parses an Ottoneu team page for basic info.
 * @param teamUrl - The public Ottoneu team URL.
 * @returns Team and league info or an error.
 */
export async function getOttoneuTeamInfo(teamUrl: string) {
  const match = teamUrl.match(/football\/(\d+)\/team\/(\d+)/);
  if (!match) {
    return { error: 'Invalid Ottoneu team URL.' };
  }

  const [, leagueId, teamId] = match;

  try {
    const res = await fetch(teamUrl);
    if (!res.ok) {
      return { error: 'Failed to fetch team page.' };
    }
    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const teamName =
      document.querySelector('.teamName')?.textContent?.trim() ||
      'Unknown Team';
    const leagueName =
      document.querySelector(
        `a[href="/football/${leagueId}/"] .desktop-navigation`
      )?.textContent?.trim() ||
      document.querySelector('.desktop-navigation')?.textContent?.trim() ||
      'Unknown League';

    const result: any = { teamName, leagueName, leagueId, teamId };

    const matchupHeader = Array.from(document.querySelectorAll('h4')).find(
      (el) => /Week\s+\d+\s+Matchup/i.test(el.textContent || '')
    );

    if (matchupHeader) {
      const weekMatch = matchupHeader.textContent?.match(/Week\s+(\d+)/i);
      const week = weekMatch ? Number(weekMatch[1]) : undefined;
      const matchupSection = matchupHeader.closest('.page-header__section');
      const gameLink = matchupSection?.querySelector('.other-games a');
      if (gameLink && week) {
        const url = gameLink.getAttribute('href') || '';
        const homeEl = gameLink.querySelector('.other-game-home-team');
        const awayEl = gameLink.querySelector('.other-game-away-team');
        const homeScoreEl = homeEl?.querySelector('.home-score');
        const awayScoreEl = awayEl?.querySelector('.away-score');
        const homeScore = parseFloat(homeScoreEl?.textContent || '0');
        const awayScore = parseFloat(awayScoreEl?.textContent || '0');
        const homeName = (homeEl?.textContent || '')
          .replace(homeScoreEl?.textContent || '', '')
          .trim();
        const awayName = (awayEl?.textContent || '')
          .replace(awayScoreEl?.textContent || '', '')
          .trim();

        let opponentName = awayName;
        let teamScore = homeScore;
        let opponentScore = awayScore;
        if (awayName.toLowerCase() === teamName.toLowerCase()) {
          opponentName = homeName;
          teamScore = awayScore;
          opponentScore = homeScore;
        }

        result.matchup = {
          week,
          opponentName,
          teamScore,
          opponentScore,
          url,
        };
      }
    }
    return result;
  } catch {
    return { error: 'Failed to fetch team page.' };
  }
}

/**
 * Connects an Ottoneu team to the user's account.
 * @param teamUrl - The public team URL.
 * @returns The parsed team info or an error.
 */
export async function connectOttoneu(
  leagueUrl: string,
  teamNameInput: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your Ottoneu team.' };
  }

  const teamResult = await findOttoneuTeamUrl(leagueUrl, teamNameInput);
  if ('error' in teamResult) {
    return { error: teamResult.error };
  }

  const info = await getOttoneuTeamInfo(teamResult.teamUrl);
  if ('error' in info) {
    return { error: info.error };
  }

  const { teamName, leagueName, leagueId, teamId, matchup } = info;

  const { data: integration, error: insertError } = await supabase
    .from('user_integrations')
    .insert({
      user_id: user.id,
      provider: 'ottoneu',
      provider_user_id: teamId,
    })
    .select()
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  const { error: leagueError } = await supabase.from('leagues').upsert({
    league_id: leagueId,
    name: leagueName,
    user_integration_id: integration.id,
  });

  if (leagueError) {
    return { error: leagueError.message };
  }

  return { teamName, leagueName, matchup };
}

/**
 * Removes an Ottoneu integration.
 * @param integrationId - The ID of the integration to remove.
 */
export async function removeOttoneuIntegration(integrationId: number) {
  const supabase = createClient();

  const { error: deleteLeaguesError } = await supabase
    .from('leagues')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

  const { error: deleteIntegrationError } = await supabase
    .from('user_integrations')
    .delete()
    .eq('id', integrationId);

  if (deleteIntegrationError) {
    return { error: `Failed to delete integration: ${deleteIntegrationError.message}` };
  }

  return { success: true };
}

/**
 * Gets the Ottoneu integration for the current user.
 */
export async function getOttoneuIntegration() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'ottoneu')
    .single();

  if (error && error.code !== 'PGRST116') {
    return { error: error.message };
  }

  return { integration: data };
}

/**
 * Gets leagues linked to an integration.
 * @param integrationId - The integration ID.
 */
export async function getLeagues(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { leagues: data };
}

