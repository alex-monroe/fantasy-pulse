const fs = require('fs');
const path = require('path');

const originalFetch = global.fetch;

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponseFromFile(filename) {
  const filePath = path.resolve(__dirname, `../goldens/${filename}`);
  const html = fs.readFileSync(filePath, 'utf-8');
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

global.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;

  // Sleeper API mocks
  if (url === 'https://api.sleeper.app/v1/state/nfl') {
    return jsonResponse({ week: 1 });
  }

  if (url === 'https://api.sleeper.app/v1/players/nfl') {
    return jsonResponse({
      p1: { full_name: 'Sleeper Player 1', position: 'QB', team: 'KC' },
      p2: { full_name: 'Sleeper Player 2', position: 'RB', team: 'SF' },
      p3: { full_name: 'Yahoo Player 1', position: 'QB', team: 'KC' },
      p4: { full_name: 'Yahoo Player 2', position: 'RB', team: 'SF' },
    });
  }

  if (url === 'https://api.sleeper.app/v1/league/league1/rosters') {
    return jsonResponse([
      { roster_id: 1, owner_id: 'sleeperUser', players: ['p1'], starters: ['p1'] },
      { roster_id: 2, owner_id: 'opponentUser', players: ['p2'], starters: ['p2'] },
    ]);
  }

  if (url === 'https://api.sleeper.app/v1/league/league1/matchups/1') {
    return jsonResponse([
      { roster_id: 1, matchup_id: 1, players_points: { p1: 10 }, players: ['p1'] },
      { roster_id: 2, matchup_id: 1, players_points: { p2: 8 }, players: ['p2'] },
    ]);
  }

  if (url === 'https://api.sleeper.app/v1/league/league1/users') {
    return jsonResponse([
      { user_id: 'sleeperUser', display_name: 'Sleeper User', metadata: { team_name: 'Sleeper Squad' } },
      { user_id: 'opponentUser', display_name: 'Opponent User', metadata: { team_name: 'Opponent Squad' } },
    ]);
  }

  // Ottoneu page mocks
  if (url === 'https://ottoneu.fangraphs.com/football/309/') {
    return htmlResponseFromFile('ottoneu_league_page.html');
  }

  if (url === 'https://ottoneu.fangraphs.com/football/309/team/2514') {
    return htmlResponseFromFile('ottoneu_team_page.html');
  }

  if (url === 'https://ottoneu.fangraphs.com/football/309/game/7282725') {
    return htmlResponseFromFile('ottoneu_matchup_page.html');
  }

  // Yahoo API mocks
  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/teams?format=json') {
    return jsonResponse({
      fantasy_content: {
        users: [
          {
            user: [
              null,
              {
                games: [
                  {
                    game: [
                      null,
                      {
                        teams: {
                          '0': {
                            team: [
                              [
                                { team_key: '123.l.456.t.1' },
                                { team_id: '1' },
                                { name: 'Yahoo Warriors' },
                                { team_logos: [{ team_logo: { url: '' } }] },
                              ],
                              { team_points: { total: '100' } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/team/123.l.456.t.1/matchups;weeks=1?format=json') {
    return jsonResponse({
      fantasy_content: {
        team: [
          null,
          {
            matchups: {
              '0': {
                matchup: {
                  '0': {
                    teams: {
                      '0': {
                        team: [
                          [
                            { team_key: '123.l.456.t.1' },
                            { team_id: '1' },
                            { name: 'Yahoo Warriors' },
                            { team_logos: [{ team_logo: { url: '' } }] },
                          ],
                          { team_points: { total: '100' } },
                        ],
                      },
                      '1': {
                        team: [
                          [
                            { team_key: '123.l.456.t.2' },
                            { team_id: '2' },
                            { name: 'Yahoo Opponents' },
                            { team_logos: [{ team_logo: { url: '' } }] },
                          ],
                          { team_points: { total: '90' } },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/team/123.l.456.t.1/roster/players?format=json') {
    return jsonResponse({
      fantasy_content: {
        team: [
          null,
          {
            roster: {
              '0': {
                players: {
                  '0': {
                    player: [
                      [
                        { player_key: 'p3' },
                        { player_id: 'p3' },
                        { name: { full: 'Yahoo Player 1' } },
                        { display_position: 'QB' },
                        { headshot: { url: '' } },
                        { editorial_team_abbr: 'KC' },
                      ],
                      { selected_position: [null, { position: 'QB' }] },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/team/123.l.456.t.2/roster/players?format=json') {
    return jsonResponse({
      fantasy_content: {
        team: [
          null,
          {
            roster: {
              '0': {
                players: {
                  '0': {
                    player: [
                      [
                        { player_key: 'p4' },
                        { player_id: 'p4' },
                        { name: { full: 'Yahoo Player 2' } },
                        { display_position: 'RB' },
                        { headshot: { url: '' } },
                        { editorial_team_abbr: 'SF' },
                      ],
                      { selected_position: [null, { position: 'RB' }] },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/team/123.l.456.t.1/roster;week=1/players/stats?format=json') {
    return jsonResponse({
      fantasy_content: {
        team: [
          null,
          {
            roster: {
              '0': {
                players: {
                  '0': {
                    player: [
                      [
                        { player_key: 'p3' },
                        { player_id: 'p3' },
                        { name: { full: 'Yahoo Player 1' } },
                        { display_position: 'QB' },
                        { headshot: { url: '' } },
                      ],
                      { player_points: { total: '15' } },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  if (url === 'https://fantasysports.yahooapis.com/fantasy/v2/team/123.l.456.t.2/roster;week=1/players/stats?format=json') {
    return jsonResponse({
      fantasy_content: {
        team: [
          null,
          {
            roster: {
              '0': {
                players: {
                  '0': {
                    player: [
                      [
                        { player_key: 'p4' },
                        { player_id: 'p4' },
                        { name: { full: 'Yahoo Player 2' } },
                        { display_position: 'RB' },
                        { headshot: { url: '' } },
                      ],
                      { player_points: { total: '12' } },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  return originalFetch(input, init);
};
