let actions: typeof import('./actions');
let createClient: jest.Mock;
let fetchMock: jest.Mock;

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));

describe('ottoneu actions', () => {
  beforeEach(async () => {
    jest.resetModules();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    actions = await import('./actions');
    createClient = (await import('@/utils/supabase/server')).createClient as jest.Mock;
  });

  describe('getOttoneuTeamInfo', () => {
    it('parses team and league info from page', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<span class="teamName">My Team</span><a href="/football/309/"><span class="desktop-navigation">My League</span></a>'
          ),
      });
      const result = await actions.getOttoneuTeamInfo(
        'https://ottoneu.fangraphs.com/football/309/team/2514'
      );
      expect(result).toEqual({
        teamName: 'My Team',
        leagueName: 'My League',
        leagueId: '309',
        teamId: '2514',
      });
    });

    it('handles single quotes in markup', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            "<span class='teamName'>My Team</span><a href='/football/309/'><span class='desktop-navigation'>My League</span></a>"
          ),
      });
      const result = await actions.getOttoneuTeamInfo(
        'https://ottoneu.fangraphs.com/football/309/team/2514'
      );
      expect(result).toEqual({
        teamName: 'My Team',
        leagueName: 'My League',
        leagueId: '309',
        teamId: '2514',
      });
    });

    it('parses weekly matchup if present', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<span class="teamName">My Team</span><a href="/football/309/"><span class="desktop-navigation">My League</span></a><div class="page-header__section"><h4>Week 2 Matchup</h4><br><ul class="other-games"><li id="game-1"><div class="game-status">LIVE</div><div><a href="/football/309/game/1"><div class="other-game-home-team">My Team<span class="other-game-score home-score">13.90</span></div><div class="other-game-away-team">Opponent<span class="other-game-score away-score">0.00</span></div></a></div></li></ul></div>'
          ),
      });
      const result = await actions.getOttoneuTeamInfo(
        'https://ottoneu.fangraphs.com/football/309/team/2514'
      );
      expect(result).toEqual({
        teamName: 'My Team',
        leagueName: 'My League',
        leagueId: '309',
        teamId: '2514',
        matchup: {
          week: 2,
          opponentName: 'Opponent',
          teamScore: 13.9,
          opponentScore: 0,
          url: '/football/309/game/1',
        },
      });
    });

    it('parses matchup when team is the away team', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<span class="teamName">My Team</span><a href="/football/309/"><span class="desktop-navigation">My League</span></a><div class="page-header__section"><h4>Week 3 Matchup</h4><br><ul class="other-games"><li id="game-1"><div class="game-status">LIVE</div><div><a href="/football/309/game/2"><div class="other-game-home-team">Opponent<span class="other-game-score home-score">10.00</span></div><div class="other-game-away-team">My Team<span class="other-game-score away-score">5.00</span></div></a></div></li></ul></div>'
          ),
      });
      const result = await actions.getOttoneuTeamInfo(
        'https://ottoneu.fangraphs.com/football/309/team/2514'
      );
      expect(result).toEqual({
        teamName: 'My Team',
        leagueName: 'My League',
        leagueId: '309',
        teamId: '2514',
        matchup: {
          week: 3,
          opponentName: 'Opponent',
          teamScore: 5,
          opponentScore: 10,
          url: '/football/309/game/2',
        },
      });
    });

    it('falls back to league name span when anchor does not match league id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<span class="teamName">My Team</span><a href="/football/309/?foo=bar"><span class="desktop-navigation">My League</span></a>'
          ),
      });
      const result = await actions.getOttoneuTeamInfo(
        'https://ottoneu.fangraphs.com/football/309/team/2514'
      );
      expect(result).toEqual({
        teamName: 'My Team',
        leagueName: 'My League',
        leagueId: '309',
        teamId: '2514',
      });
    });

    it('returns error on invalid url', async () => {
      const result = await actions.getOttoneuTeamInfo('https://example.com');
      expect(result).toEqual({ error: 'Invalid Ottoneu team URL.' });
    });
  });

  describe('getOttoneuLeagueTeams', () => {
    it('returns teams from standings table', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<section class="section-container"><header class="section-container-header"><h3 class="section-container-header__title">2025 Standings</h3></header><div class="table-container"><table><thead><tr><th>Team</th><th>Record</th><th>PF</th><th>PA</th></tr></thead><tbody><tr class="subheader"><td colspan="4">Division</td></tr><tr><td><a href="/football/309/team/2514">The Witchcraft</a></td><td>1-1</td><td>207.16</td><td>230.02</td></tr><tr><td><a href="/football/309/team/2531">Tinseltown Little Gold Men</a></td><td>2-0</td><td>231.44</td><td>190.16</td></tr></tbody></table></div></section>'
          ),
      });

      const result = await actions.getOttoneuLeagueTeams(
        'https://ottoneu.fangraphs.com/football/309/'
      );

      expect(result).toEqual({
        teams: ['The Witchcraft', 'Tinseltown Little Gold Men'],
      });
    });

    it('returns error for invalid url', async () => {
      const result = await actions.getOttoneuLeagueTeams('https://example.com');
      expect(result).toEqual({ error: 'Invalid Ottoneu league URL.' });
    });

    it('returns error when fetch fails', async () => {
      fetchMock.mockResolvedValue({ ok: false });

      const result = await actions.getOttoneuLeagueTeams(
        'https://ottoneu.fangraphs.com/football/309/'
      );

      expect(result).toEqual({ error: 'Failed to fetch league page.' });
    });

    it('returns error when no teams found', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<table><thead><tr><th>Team</th></tr></thead><tbody></tbody></table>'
          ),
      });

      const result = await actions.getOttoneuLeagueTeams(
        'https://ottoneu.fangraphs.com/football/309/'
      );

      expect(result).toEqual({ error: 'Could not find teams in standings.' });
    });
  });

  describe('connectOttoneu', () => {
    const buildSupabase = () => {
      const singleMock = jest
        .fn()
        .mockResolvedValue({ data: { id: 42 }, error: null });
      const selectMock = jest.fn().mockReturnValue({ single: singleMock });
      const insertMock = jest.fn().mockReturnValue({ select: selectMock });
      const upsertMock = jest.fn().mockResolvedValue({ error: null });

      const supabase = {
        auth: {
          getUser: jest
            .fn()
            .mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        },
        from: jest.fn((table: string) => {
          if (table === 'user_integrations') {
            return { insert: insertMock } as any;
          }
          if (table === 'leagues') {
            return { upsert: upsertMock } as any;
          }
          return {} as any;
        }),
      } as any;

      return { supabase, insertMock, upsertMock };
    };

    it('connects using league page and team name', async () => {
      const { supabase, insertMock, upsertMock } = buildSupabase();
      createClient.mockReturnValue(supabase);

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              '<section class="section-container"><header class="section-container-header"><h3 class="section-container-header__title">2025 Standings</h3></header><div class="table-container"><table><thead><tr><th>Team</th><th>Record</th><th>PF</th><th>PA</th></tr></thead><tbody><tr><td><a href="/football/309/team/2514">The Witchcraft</a></td><td>1-1</td><td>207.16</td><td>230.02</td></tr></tbody></table></div></section>'
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              '<span class="teamName">The Witchcraft</span><a href="/football/309/"><span class="desktop-navigation">The SOFA</span></a>'
            ),
        });

      const result = await actions.connectOttoneu(
        'https://ottoneu.fangraphs.com/football/309/',
        'The Witchcraft'
      );

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://ottoneu.fangraphs.com/football/309/'
      );
      expect(insertMock).toHaveBeenCalledWith({
        user_id: 'user-1',
        provider: 'ottoneu',
        provider_user_id: '2514',
      });
      expect(upsertMock).toHaveBeenCalledWith({
        league_id: '309',
        name: 'The SOFA',
        user_integration_id: 42,
      });
      expect(result).toMatchObject({
        teamName: 'The Witchcraft',
        leagueName: 'The SOFA',
      });
      expect(result.matchup).toBeUndefined();
    });

    it('returns error when team cannot be found', async () => {
      const { supabase } = buildSupabase();
      createClient.mockReturnValue(supabase);

      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<table></table>'),
      });

      const result = await actions.connectOttoneu(
        'https://ottoneu.fangraphs.com/football/309/',
        'Missing Team'
      );

      expect(result).toEqual({ error: 'Could not find team in standings.' });
    });
  });
});
