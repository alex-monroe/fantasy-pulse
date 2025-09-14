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
          '<span class="teamName">My Team</span><span class="desktop-navigation">My League</span>'
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

  it('returns error on invalid url', async () => {
    const result = await getOttoneuTeamInfo('https://example.com');
    expect(result).toEqual({ error: 'Invalid Ottoneu team URL.' });
  });
});

