'use server';

import { createClient } from '@/utils/supabase/server';
import { JSDOM } from 'jsdom';

function normalizeTeamName(name: string) {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

type StandingsTeam = {
  name: string;
  url: string;
  normalizedName: string;
};

function parseLeagueUrl(
  leagueUrl: string
): { baseUrl: URL } | { error: string } {
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

  return { baseUrl: parsedUrl };
}

function findStandingsAnchors(document: Document) {
  const standingsSections = Array.from(
    document.querySelectorAll('section.section-container')
  );

  for (const section of standingsSections) {
    const heading =
      section.querySelector('.section-container-header__title') ||
      section.querySelector('h1, h2, h3, h4, h5, h6');

    if (heading && /standings/i.test(heading.textContent || '')) {
      const anchors = Array.from(
        section.querySelectorAll('table a[href*="/team/"]')
      );

      if (anchors.length > 0) {
        return anchors;
      }
    }
  }

  const anchors: HTMLAnchorElement[] = [];
  const tables = Array.from(document.querySelectorAll('table'));
  for (const table of tables) {
    const headerTexts = Array.from(table.querySelectorAll('thead th'))
      .map((th) => th.textContent?.trim().toLowerCase())
      .filter(Boolean) as string[];

    if (!headerTexts.includes('team')) {
      continue;
    }

    anchors.push(...table.querySelectorAll('tbody a[href*="/team/"]'));
  }

  return anchors;
}

async function fetchLeagueTeams(
  leagueUrl: string
): Promise<{ baseUrl: URL; teams: StandingsTeam[] } | { error: string }> {
  const parsedResult = parseLeagueUrl(leagueUrl);
  if ('error' in parsedResult) {
    return parsedResult;
  }

  const { baseUrl } = parsedResult;

  try {
    const res = await fetch(baseUrl.toString());
    if (!res.ok) {
      return { error: 'Failed to fetch league page.' };
    }

    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const anchors = findStandingsAnchors(document);

    const teams = anchors
      .map((anchor) => {
        const name = anchor.textContent?.replace(/\s+/g, ' ').trim();
        const href = anchor.getAttribute('href') || '';
        if (!name || !href) {
          return null;
        }

        let absoluteHref: string;
        try {
          absoluteHref = new URL(href, baseUrl.toString()).toString();
        } catch {
          return null;
        }

        if (!/football\/\d+\/team\/\d+/.test(absoluteHref)) {
          return null;
        }

        return {
          name,
          url: absoluteHref,
          normalizedName: normalizeTeamName(name),
        } satisfies StandingsTeam;
      })
      .filter((team): team is StandingsTeam => team !== null);

    const dedupedTeams: StandingsTeam[] = [];
    const seen = new Set<string>();
    for (const team of teams) {
      if (seen.has(team.normalizedName)) {
        continue;
      }
      seen.add(team.normalizedName);
      dedupedTeams.push(team);
    }

    return { baseUrl, teams: dedupedTeams };
  } catch {
    return { error: 'Failed to fetch league page.' };
  }
}

async function findOttoneuTeamUrl(
  leagueUrl: string,
  teamName: string
): Promise<{ teamUrl: string } | { error: string }> {
  const trimmedTeamName = teamName.trim();
  if (!trimmedTeamName) {
    return { error: 'Team name is required.' };
  }

  const result = await fetchLeagueTeams(leagueUrl);
  if ('error' in result) {
    return result;
  }

  const normalizedTeamName = normalizeTeamName(trimmedTeamName);

  if (result.teams.length === 0) {
    return { error: 'Could not find team in standings.' };
  }

  const exactMatch = result.teams.find(
    (team) => team.normalizedName === normalizedTeamName
  );

  const partialMatch = result.teams.find((team) =>
    team.normalizedName.includes(normalizedTeamName)
  );

  const match = exactMatch || partialMatch;

  if (!match) {
    return { error: 'Could not find team in standings.' };
  }

  return { teamUrl: match.url };
}

export async function getOttoneuLeagueTeams(leagueUrl: string) {
  const result = await fetchLeagueTeams(leagueUrl);
  if ('error' in result) {
    return result;
  }

  if (result.teams.length === 0) {
    return { error: 'Could not find teams in standings.' };
  }

  return { teams: result.teams.map((team) => team.name) };
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

