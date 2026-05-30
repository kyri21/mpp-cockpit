// Fonction serverless Vercel : stats d'equipes via football-data.org.
// Necessite la variable d'environnement FOOTBALL_DATA_API_KEY.
//
// Parametres query string :
//   home : nom de l'equipe a domicile (ex. "France")
//   away : nom de l'equipe a l'exterieur (ex. "Morocco")
//
// Reponse : { home: { form, played, won, drawn, lost, goalsFor, goalsAgainst },
//             away: { ... }, h2h: [...derniers matchs entre les deux equipes] }

const BASE = "https://api.football-data.org/v4";

// Code de la competition Coupe du Monde 2026 sur football-data.org.
// Le code standard est "WC" pour FIFA World Cup.
const COMPETITION = "WC";

async function fetchFD(path, key) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": key },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status} sur ${path}`);
  return res.json();
}

export default async function handler(req, res) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Cle FOOTBALL_DATA_API_KEY manquante dans Vercel." });
  }

  const { home, away } = req.query;
  if (!home || !away) {
    return res.status(400).json({ error: "Parametres home et away requis." });
  }

  try {
    // Classement et forme des equipes dans le groupe.
    const standingsData = await fetchFD(`/competitions/${COMPETITION}/standings`, key);

    // Trouver les equipes dans le classement pour extraire leur forme.
    let homeStats = null, awayStats = null;
    for (const group of standingsData.standings || []) {
      for (const entry of group.table || []) {
        const name = entry.team.name;
        if (name.toLowerCase().includes(home.toLowerCase())) homeStats = entry;
        if (name.toLowerCase().includes(away.toLowerCase())) awayStats = entry;
      }
    }

    // Matchs recents de la competition (pour extraire la forme et le H2H).
    const matchesData = await fetchFD(`/competitions/${COMPETITION}/matches?status=FINISHED`, key);
    const matches = matchesData.matches || [];

    // H2H : matchs entre les deux equipes dans ce tournoi.
    const h2h = matches.filter((m) => {
      const hn = m.homeTeam.name.toLowerCase();
      const an = m.awayTeam.name.toLowerCase();
      const h = home.toLowerCase(), a = away.toLowerCase();
      return (hn.includes(h) && an.includes(a)) || (hn.includes(a) && an.includes(h));
    }).slice(0, 5);

    // Forme des 5 derniers matchs de chaque equipe dans la competition.
    function recentForm(teamName) {
      const tl = teamName.toLowerCase();
      return matches
        .filter((m) => m.homeTeam.name.toLowerCase().includes(tl) || m.awayTeam.name.toLowerCase().includes(tl))
        .slice(-5)
        .map((m) => {
          const isHome = m.homeTeam.name.toLowerCase().includes(tl);
          const scored = isHome ? m.score.fullTime.home : m.score.fullTime.away;
          const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;
          if (scored > conceded) return { result: "W", scored, conceded };
          if (scored === conceded) return { result: "D", scored, conceded };
          return { result: "L", scored, conceded };
        });
    }

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
    res.json({
      home: {
        name: homeStats?.team?.name || home,
        form: recentForm(home),
        played: homeStats?.playedGames ?? null,
        won: homeStats?.won ?? null,
        drawn: homeStats?.draw ?? null,
        lost: homeStats?.lost ?? null,
        goalsFor: homeStats?.goalsFor ?? null,
        goalsAgainst: homeStats?.goalsAgainst ?? null,
        points: homeStats?.points ?? null,
      },
      away: {
        name: awayStats?.team?.name || away,
        form: recentForm(away),
        played: awayStats?.playedGames ?? null,
        won: awayStats?.won ?? null,
        drawn: awayStats?.draw ?? null,
        lost: awayStats?.lost ?? null,
        goalsFor: awayStats?.goalsFor ?? null,
        goalsAgainst: awayStats?.goalsAgainst ?? null,
        points: awayStats?.points ?? null,
      },
      h2h,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
