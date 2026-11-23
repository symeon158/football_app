"""Deterministic generator for the fictional Football Legends player catalogue.

All players, clubs and biographies are invented. Output is a SQL migration so
production and local databases receive exactly the same catalogue. The same
seed always produces byte-identical output (stable UUIDv5 ids), so the file can
be regenerated and diffed safely.
"""

from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass, field
from datetime import date

SEED = 20261123
NAMESPACE = uuid.UUID("6f1b6c2e-0d5a-4c39-9a3e-5b7d2f9a1c40")
REFERENCE_DATE = date(2026, 7, 1)  # ages are computed against the season start

STATS = ("pace", "shooting", "passing", "dribbling", "defending", "physicality")

# Weight of each face stat in a position's overall rating (each row sums to 1).
POSITION_WEIGHTS: dict[str, tuple[float, ...]] = {
    "GK":  (1 / 6,) * 6,  # GK cards reuse the six slots as DIV/HAN/KIC/REF/SPD/POS
    "CB":  (0.10, 0.00, 0.08, 0.04, 0.50, 0.28),
    "LB":  (0.28, 0.00, 0.15, 0.12, 0.30, 0.15),
    "RB":  (0.28, 0.00, 0.15, 0.12, 0.30, 0.15),
    "CDM": (0.05, 0.05, 0.25, 0.10, 0.35, 0.20),
    "CM":  (0.08, 0.12, 0.36, 0.20, 0.12, 0.12),
    "CAM": (0.12, 0.22, 0.32, 0.30, 0.00, 0.04),
    "LM":  (0.28, 0.12, 0.24, 0.28, 0.03, 0.05),
    "RM":  (0.28, 0.12, 0.24, 0.28, 0.03, 0.05),
    "LW":  (0.28, 0.22, 0.15, 0.30, 0.00, 0.05),
    "RW":  (0.28, 0.22, 0.15, 0.30, 0.00, 0.05),
    "ST":  (0.20, 0.40, 0.08, 0.20, 0.00, 0.12),
}
POSITION_NAMES = {
    "GK": "goalkeeper", "CB": "centre-back", "LB": "left-back", "RB": "right-back",
    "CDM": "defensive midfielder", "CM": "central midfielder", "CAM": "attacking midfielder",
    "LM": "left midfielder", "RM": "right midfielder", "LW": "left winger",
    "RW": "right winger", "ST": "striker",
}

RARITY_BANDS: dict[str, tuple[int, int]] = {
    "common": (52, 69),
    "rare": (70, 77),
    "epic": (78, 83),
    "legendary": (84, 89),
    "icon": (90, 95),
}

# Invented name pools grouped by (ISO country code, country name).
NAME_POOLS: dict[tuple[str, str], tuple[list[str], list[str]]] = {
    ("GB", "England"): (
        ["Alfie", "Callum", "Rhys", "Jack", "Ollie", "Toby", "Harvey", "Reece", "Kieran", "Jude"],
        ["Ashworth", "Pembrook", "Thornley", "Calloway", "Hartwell", "Fenwick", "Brindle", "Oakhurst", "Wexley", "Stanmore"],
    ),
    ("ES", "Spain"): (
        ["Iker", "Álvaro", "Mateo", "Rubén", "Unai", "Adrián", "Hugo", "Martí", "Dario", "Íñigo"],
        ["Arandilla", "Corvera", "Valdemar", "Olmedo", "Barrueco", "Lizarra", "Monteagudo", "Peñalba", "Sotomar", "Quiroga"],
    ),
    ("BR", "Brazil"): (
        ["Thiago", "Caio", "Rafael", "Davi", "Luan", "Wesley", "Bruno", "Kauã", "Gabriel", "Murilo"],
        ["Albuquerque", "Bragança", "Carvalhedo", "Moreirão", "Tavora", "Quintanilha", "Serafim", "Pimentel", "Valadares", "Rocha Lima"],
    ),
    ("FR", "France"): (
        ["Mathis", "Enzo", "Théo", "Lucas", "Noé", "Bastien", "Yanis", "Clément", "Rayan", "Hugo"],
        ["Delaunay", "Marchetti", "Fontanel", "Vasseur", "Lemercier", "Rouvière", "Chastain", "Belloc", "Garnaud", "Thierrin"],
    ),
    ("DE", "Germany"): (
        ["Lukas", "Jonas", "Finn", "Felix", "Leon", "Niklas", "Moritz", "Jannik", "Timo", "Paul"],
        ["Brenneke", "Halvorsen", "Kesselring", "Lindqvist", "Ostermann", "Ritterbach", "Stoltzer", "Wendhausen", "Grubeck", "Albrecht"],
    ),
    ("IT", "Italy"): (
        ["Lorenzo", "Matteo", "Davide", "Federico", "Gianluca", "Tommaso", "Riccardo", "Nicolò", "Simone", "Andrea"],
        ["Bellandi", "Castroni", "Ferravanti", "Lucchetti", "Marzocca", "Pellegrini-Ruz", "Santoriello", "Vannucchi", "Zanardo", "Morettini"],
    ),
    ("GR", "Greece"): (
        ["Giorgos", "Nikos", "Dimitris", "Kostas", "Panagiotis", "Stelios", "Thanasis", "Vasilis", "Christos", "Manolis"],
        ["Antoniadis", "Galanopoulos", "Kyriazis", "Lambrakos", "Mavridis", "Papastergiou", "Skourletis", "Theodorakis", "Vlachogiannis", "Zervoudakis"],
    ),
    ("AR", "Argentina"): (
        ["Facundo", "Santiago", "Joaquín", "Tomás", "Lautaro", "Bautista", "Agustín", "Thiago", "Valentín", "Franco"],
        ["Echeverría", "Benedetto-Ruiz", "Cardozo", "Iturbe", "Maldonado", "Pereyra-Sosa", "Quintero", "Saravia", "Villafañe", "Zabaleta-Ortiz"],
    ),
    ("NG", "Nigeria"): (
        ["Chidi", "Emeka", "Tobi", "Kelechi", "Femi", "Ifeanyi", "Segun", "Obinna", "Tunde", "Uche"],
        ["Adebanjo", "Chukwuma", "Ezeani", "Ibekwe", "Nwankwor", "Okonjo", "Olatunde", "Onyekachi", "Uzoma", "Akinsola"],
    ),
    ("JP", "Japan"): (
        ["Haruto", "Ren", "Sota", "Yuto", "Kaito", "Riku", "Daichi", "Takumi", "Shun", "Kenta"],
        ["Aokawa", "Fujimura", "Hayasaki", "Ishimoto", "Kawaguchi-Ono", "Matsuzaki", "Nakahara", "Sugimori", "Takeuchi", "Yoshinaga"],
    ),
    ("NL", "Netherlands"): (
        ["Daan", "Sem", "Milan", "Luuk", "Bram", "Jesse", "Thijs", "Stijn", "Ruben", "Joep"],
        ["van Aalst", "Brouwersma", "de Kloet", "Hoogendam", "Jansevelt", "Kuipersma", "van Leerdam", "Molendijk", "Roodbeen", "Vermaat"],
    ),
    ("PT", "Portugal"): (
        ["Rodrigo", "Diogo", "Gonçalo", "Tiago", "Duarte", "Afonso", "Rúben", "Vasco", "Nuno", "Simão"],
        ["Antunes-Leal", "Barreiros", "Cordeiro", "Figueiredo-Paz", "Gouveia", "Lourenço", "Magalhães-Rei", "Pinheiro", "Quaresmo", "Sequeira"],
    ),
}

CLUBS = [
    "Northport Athletic", "Valmora FC", "Redcliffe United", "Porto Celeste",
    "Kingsbridge Rovers", "Atlético Serrano", "Sporting Almara", "Eastmere City",
    "FC Lindenhof", "Olympia Thessa", "Real Costavera", "Dynamo Varsk",
]
ICON_CLUB = "Legends XI"

TRAITS = {
    "GK": ["commands the box with authority", "is famous for reflex saves", "distributes the ball like a playmaker"],
    "CB": ["reads the game superbly", "dominates aerial duels", "brings the ball out from the back with confidence"],
    "LB": ["overlaps tirelessly down the left", "is a defensive rock on the flank", "delivers dangerous crosses"],
    "RB": ["overlaps tirelessly down the right", "is a defensive rock on the flank", "delivers dangerous crosses"],
    "CDM": ["shields the back line", "breaks up play relentlessly", "dictates tempo from deep"],
    "CM": ["covers every blade of grass", "links defence and attack", "has an eye for the killer pass"],
    "CAM": ["unlocks defences with creativity", "thrives between the lines", "is lethal from the edge of the box"],
    "LM": ["beats full-backs for fun", "works hard in both directions", "whips in pinpoint crosses"],
    "RM": ["beats full-backs for fun", "works hard in both directions", "whips in pinpoint crosses"],
    "LW": ["cuts inside onto the stronger foot", "terrifies defenders with pace", "creates chances out of nothing"],
    "RW": ["cuts inside onto the stronger foot", "terrifies defenders with pace", "creates chances out of nothing"],
    "ST": ["is a clinical finisher", "leads the line with physical presence", "always finds space in the box"],
}

# How many cards of each rarity to create per position.
PER_POSITION = {"common": 5, "rare": 2, "epic": 1}
GK_PER_RARITY = {"common": 6, "rare": 2, "epic": 1}
LEGENDARY_POSITIONS = ["GK", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "ST"]
ICON_POSITIONS = ["GK", "CB", "CM", "CAM", "ST"]


@dataclass
class Card:
    rarity: str
    position: str
    overall: int
    stats: dict[str, int]
    weak_foot: int
    skill_moves: int
    preferred_foot: str
    market_price: int


@dataclass
class Player:
    id: uuid.UUID
    card_id: uuid.UUID
    first_name: str
    last_name: str
    nationality: str
    country: str
    birth_date: date
    club: str
    height_cm: int
    biography: str
    career: list[dict[str, object]] = field(default_factory=list)
    card: Card | None = None


def compute_overall(position: str, stats: dict[str, int]) -> int:
    weights = POSITION_WEIGHTS[position]
    return round(sum(w * stats[s] for w, s in zip(weights, STATS)))


def _clamp(v: float, lo: int = 1, hi: int = 99) -> int:
    return max(lo, min(hi, round(v)))


def generate_stats(rng: random.Random, position: str, target: int) -> tuple[dict[str, int], int]:
    """Stats shaped by the position's weights, shifted so overall == target."""
    weights = POSITION_WEIGHTS[position]
    if position == "GK":
        stats = {s: _clamp(target + rng.uniform(-6, 6)) for s in STATS}
    else:
        stats = {}
        for w, s in zip(weights, STATS):
            # key attributes sit above the overall, irrelevant ones well below
            offset = (w - 0.15) * 60 + rng.uniform(-5, 5)
            stats[s] = _clamp(target + offset, 15)
    for _ in range(20):
        diff = target - compute_overall(position, stats)
        if diff == 0:
            break
        step = 1 if diff > 0 else -1
        keys = [s for w, s in sorted(zip(weights, STATS), reverse=True) if w > 0]
        for s in keys[: max(1, abs(diff))]:
            stats[s] = _clamp(stats[s] + step, 15)
    return stats, compute_overall(position, stats)


def price_for(rarity: str, overall: int) -> int:
    base, per_point, floor = {
        "common": (100, 12, 52), "rare": (600, 80, 70), "epic": (1500, 200, 78),
        "legendary": (4000, 600, 84), "icon": (10000, 2000, 90),
    }[rarity]
    return base + per_point * max(0, overall - floor)


def _birth_date(rng: random.Random, min_age: int, max_age: int) -> date:
    age = rng.randint(min_age, max_age)
    return date(REFERENCE_DATE.year - age, rng.randint(1, 12), rng.randint(1, 28))


def _age(born: date) -> int:
    r = REFERENCE_DATE
    return r.year - born.year - ((r.month, r.day) < (born.month, born.day))


def generate_catalog(seed: int = SEED) -> list[Player]:
    rng = random.Random(seed)
    slots: list[tuple[str, str]] = []
    for pos in POSITION_WEIGHTS:
        per = GK_PER_RARITY if pos == "GK" else PER_POSITION
        for rarity, n in per.items():
            slots += [(rarity, pos)] * n
    slots += [("legendary", p) for p in LEGENDARY_POSITIONS]
    slots += [("icon", p) for p in ICON_POSITIONS]

    used_names: set[str] = set()
    countries = list(NAME_POOLS)
    players: list[Player] = []
    for idx, (rarity, pos) in enumerate(slots):
        code, country = countries[rng.randrange(len(countries))]
        firsts, lasts = NAME_POOLS[(code, country)]
        while True:
            first, last = rng.choice(firsts), rng.choice(lasts)
            if f"{first} {last}" not in used_names:
                used_names.add(f"{first} {last}")
                break

        lo, hi = RARITY_BANDS[rarity]
        stats, overall = generate_stats(rng, pos, rng.randint(lo, hi))
        overall = max(lo, min(hi, overall))
        is_icon = rarity == "icon"
        born = _birth_date(rng, 38, 52) if is_icon else _birth_date(rng, 18, 35)
        club = ICON_CLUB if is_icon else rng.choice(CLUBS)
        foot = "left" if (pos in ("LB", "LM", "LW") and rng.random() < 0.7) or rng.random() < 0.2 else "right"
        skill_base = {"GK": 1, "CB": 2, "LB": 2, "RB": 2, "CDM": 2, "CM": 3}.get(pos, 3)
        card = Card(
            rarity=rarity, position=pos, overall=overall, stats=stats,
            weak_foot=rng.randint(2, 5 if rarity in ("legendary", "icon") else 4),
            skill_moves=min(5, skill_base + rng.randint(0, 2) + (1 if rarity in ("legendary", "icon") else 0)),
            preferred_foot=foot, market_price=price_for(rarity, overall),
        )

        career_clubs = rng.sample([c for c in CLUBS if c != club], k=rng.randint(1, 3))
        start_year = born.year + rng.randint(17, 19)
        career: list[dict[str, object]] = []
        year = start_year
        for c in career_clubs + ([] if is_icon else [club]):
            span = rng.randint(1, 4)
            apps = span * rng.randint(18, 38)
            goal_rate = {"ST": 0.45, "LW": 0.3, "RW": 0.3, "CAM": 0.25}.get(pos, 0.05)
            career.append({
                "from": year, "to": min(year + span, REFERENCE_DATE.year), "club": c,
                "appearances": apps, "goals": int(apps * goal_rate * rng.uniform(0.5, 1.3)),
            })
            year += span
            if year >= REFERENCE_DATE.year:
                break

        name = f"{first} {last}"
        trait = rng.choice(TRAITS[pos])
        if is_icon:
            bio = (f"{name} is a retired {country} {POSITION_NAMES[pos]} and one of the icons of the "
                   f"Football Legends universe. In their prime they {trait}.")
        else:
            bio = (f"{name} is a {_age(born)}-year-old {POSITION_NAMES[pos]} from {country} "
                   f"playing for {club}. Known across the league as a player who {trait}.")

        players.append(Player(
            id=uuid.uuid5(NAMESPACE, f"player:{idx}"),
            card_id=uuid.uuid5(NAMESPACE, f"card:{idx}:base"),
            first_name=first, last_name=last, nationality=code, country=country,
            birth_date=born, club=club, height_cm=rng.randint(168, 198) if pos != "GK" else rng.randint(185, 200),
            biography=bio, career=career, card=card,
        ))
    return players


def _q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render_sql(players: list[Player]) -> str:
    out = [
        "-- =============================================================================",
        "-- Football Legends — fictional player catalogue (GENERATED, do not edit)",
        "-- Regenerate with:  uv run football-app generate-catalog",
        "-- All names, clubs and biographies are invented.",
        "-- =============================================================================",
        "",
        "insert into public.players",
        "  (id, first_name, last_name, nationality, birth_date, club, primary_position,",
        "   height_cm, biography, career_summary, is_fictional)",
        "values",
    ]
    rows = []
    for p in players:
        assert p.card is not None
        career = json.dumps(p.career, ensure_ascii=False, separators=(",", ":"))
        rows.append(
            f"  ('{p.id}', {_q(p.first_name)}, {_q(p.last_name)}, '{p.nationality}', "
            f"'{p.birth_date.isoformat()}', {_q(p.club)}, '{p.card.position}', {p.height_cm}, "
            f"{_q(p.biography)}, {_q(career)}::jsonb, true)"
        )
    out.append(",\n".join(rows) + ";")
    out += [
        "",
        "insert into public.player_cards",
        "  (id, player_id, edition, rarity, position, overall, pace, shooting, passing,",
        "   dribbling, defending, physicality, weak_foot, skill_moves, preferred_foot, market_price)",
        "values",
    ]
    rows = []
    for p in players:
        c = p.card
        assert c is not None
        s = c.stats
        rows.append(
            f"  ('{p.card_id}', '{p.id}', 'base', '{c.rarity}', '{c.position}', {c.overall}, "
            f"{s['pace']}, {s['shooting']}, {s['passing']}, {s['dribbling']}, {s['defending']}, "
            f"{s['physicality']}, {c.weak_foot}, {c.skill_moves}, '{c.preferred_foot}', {c.market_price})"
        )
    out.append(",\n".join(rows) + ";")
    return "\n".join(out) + "\n"
