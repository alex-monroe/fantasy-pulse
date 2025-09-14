import { getOttoneuTeamInfo } from './actions';

global.fetch = jest.fn();

describe('ottoneu actions', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('parses team and league info from page', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<span class="teamName">My Team</span><a href="/football/309/"><span class="desktop-navigation">My League</span></a>'
        ),
    });
    const result = await getOttoneuTeamInfo(
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
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<span class='teamName'>My Team</span><a href='/football/309/'><span class='desktop-navigation'>My League</span></a>"
        ),
    });
    const result = await getOttoneuTeamInfo(
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
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<span class="teamName">My Team</span><a href="/football/309/"><span class="desktop-navigation">My League</span></a><div class="page-header__section"><h4>Week 2 Matchup</h4><br><ul class="other-games"><li id="game-1"><div class="game-status">LIVE</div><div><a href="/football/309/game/1"><div class="other-game-home-team">My Team<span class="other-game-score home-score">13.90</span></div><div class="other-game-away-team">Opponent<span class="other-game-score away-score">0.00</span></div></a></div></li></ul></div>'
        ),
    });
    const result = await getOttoneuTeamInfo(
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
      },
    });
  });

  it('returns error on invalid url', async () => {
    const result = await getOttoneuTeamInfo('https://example.com');
    expect(result).toEqual({ error: 'Invalid Ottoneu team URL.' });
  });
});

