from collections import Counter

from football_app import CATALOG_MIGRATION
from football_app.catalog import (
    POSITION_WEIGHTS,
    RARITY_BANDS,
    STATS,
    compute_overall,
    generate_catalog,
    render_sql,
)


def test_generation_is_deterministic():
    assert render_sql(generate_catalog()) == render_sql(generate_catalog())


def test_weights_sum_to_one():
    for pos, weights in POSITION_WEIGHTS.items():
        assert abs(sum(weights) - 1) < 1e-9, pos


def test_cards_are_valid():
    players = generate_catalog()
    for p in players:
        c = p.card
        assert c is not None
        lo, hi = RARITY_BANDS[c.rarity]
        assert lo <= c.overall <= hi, (p.first_name, p.last_name, c.rarity, c.overall)
        assert all(1 <= c.stats[s] <= 99 for s in STATS)
        assert abs(compute_overall(c.position, c.stats) - c.overall) <= 1
        assert 1 <= c.weak_foot <= 5 and 1 <= c.skill_moves <= 5
        assert c.market_price > 0


def test_unique_names_and_ids():
    players = generate_catalog()
    assert len({(p.first_name, p.last_name) for p in players}) == len(players)
    assert len({p.id for p in players}) == len(players)
    assert len({p.card_id for p in players}) == len(players)


def test_enough_commons_for_every_starter_position():
    # New accounts get a common card for each 4-3-3 position.
    commons = Counter(p.card.position for p in generate_catalog() if p.card.rarity == "common")
    for pos in ("GK", "LB", "CB", "RB", "CM", "LW", "ST", "RW"):
        assert commons[pos] >= 4, pos
    # plus 5 extra bench commons
    assert sum(commons.values()) >= 16


def test_committed_migration_is_up_to_date():
    assert CATALOG_MIGRATION.read_text(encoding="utf-8") == render_sql(generate_catalog())
