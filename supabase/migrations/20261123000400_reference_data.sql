-- =============================================================================
-- Football Legends — Phase 1: reference data required by the game
-- (lives in a migration, not seed.sql, because production needs it too)
-- =============================================================================

-- Pitch coordinates: x = 0 (left touchline) … 100 (right), y = 0 (own goal) … 100 (opponent goal).
insert into public.formation_slots (formation, slot, position, x, y) values
  ('4-3-3', 0, 'GK', 50, 6),  ('4-3-3', 1, 'LB', 15, 28), ('4-3-3', 2, 'CB', 37, 24),
  ('4-3-3', 3, 'CB', 63, 24), ('4-3-3', 4, 'RB', 85, 28), ('4-3-3', 5, 'CM', 30, 50),
  ('4-3-3', 6, 'CM', 50, 46), ('4-3-3', 7, 'CM', 70, 50), ('4-3-3', 8, 'LW', 18, 76),
  ('4-3-3', 9, 'ST', 50, 84), ('4-3-3', 10, 'RW', 82, 76),

  ('4-4-2', 0, 'GK', 50, 6),  ('4-4-2', 1, 'LB', 15, 28), ('4-4-2', 2, 'CB', 37, 24),
  ('4-4-2', 3, 'CB', 63, 24), ('4-4-2', 4, 'RB', 85, 28), ('4-4-2', 5, 'LM', 15, 54),
  ('4-4-2', 6, 'CM', 38, 50), ('4-4-2', 7, 'CM', 62, 50), ('4-4-2', 8, 'RM', 85, 54),
  ('4-4-2', 9, 'ST', 38, 82), ('4-4-2', 10, 'ST', 62, 82),

  ('3-5-2', 0, 'GK', 50, 6),  ('3-5-2', 1, 'CB', 28, 24), ('3-5-2', 2, 'CB', 50, 22),
  ('3-5-2', 3, 'CB', 72, 24), ('3-5-2', 4, 'LM', 10, 54), ('3-5-2', 5, 'CM', 33, 50),
  ('3-5-2', 6, 'CDM', 50, 40), ('3-5-2', 7, 'CM', 67, 50), ('3-5-2', 8, 'RM', 90, 54),
  ('3-5-2', 9, 'ST', 38, 82), ('3-5-2', 10, 'ST', 62, 82),

  ('4-2-3-1', 0, 'GK', 50, 6),  ('4-2-3-1', 1, 'LB', 15, 28), ('4-2-3-1', 2, 'CB', 37, 24),
  ('4-2-3-1', 3, 'CB', 63, 24), ('4-2-3-1', 4, 'RB', 85, 28), ('4-2-3-1', 5, 'CDM', 38, 42),
  ('4-2-3-1', 6, 'CDM', 62, 42), ('4-2-3-1', 7, 'LW', 18, 66), ('4-2-3-1', 8, 'CAM', 50, 64),
  ('4-2-3-1', 9, 'RW', 82, 66), ('4-2-3-1', 10, 'ST', 50, 86);

insert into public.stadium_upgrade_costs (category, level, cost, bonus_pct, description) values
  ('seating',    2,   500, 0.50, 'Covered stands — capacity 12,000'),
  ('seating',    3,  1500, 1.00, 'Two-tier stands — capacity 25,000'),
  ('seating',    4,  4000, 1.50, 'Wrap-around bowl — capacity 45,000'),
  ('seating',    5, 10000, 2.00, 'Legendary cathedral — capacity 70,000'),
  ('lighting',   2,   300, 0.25, 'Floodlight towers'),
  ('lighting',   3,   900, 0.50, 'LED floodlights'),
  ('lighting',   4,  2500, 0.75, 'Broadcast-grade lighting'),
  ('lighting',   5,  6000, 1.00, 'Dynamic light show'),
  ('pitch',      2,   400, 0.50, 'Drained natural grass'),
  ('pitch',      3,  1200, 1.00, 'Hybrid turf'),
  ('pitch',      4,  3000, 1.50, 'Under-soil heating'),
  ('pitch',      5,  8000, 2.00, 'Championship-grade pitch'),
  ('facilities', 2,   350, 0.25, 'Modern dressing rooms'),
  ('facilities', 3,  1000, 0.50, 'Recovery & medical centre'),
  ('facilities', 4,  2800, 0.75, 'Performance analytics suite'),
  ('facilities', 5,  7000, 1.00, 'Elite training complex');

insert into public.challenges (code, title, description, period, metric, target, reward_coins, reward_xp) values
  ('daily_play_2',        'Warm-up',            'Play 2 matches today.',                         'daily',         'matches_played',   2,  50,  20),
  ('daily_win_1',         'Daily Victory',      'Win a match today.',                            'daily',         'matches_won',      1, 100,  30),
  ('daily_score_3',       'Goal Rush',          'Score 3 goals today.',                          'daily',         'goals_scored',     3,  75,  25),
  ('weekly_win_3',        'Winning Streak',     'Win three matches this week.',                  'weekly',        'matches_won',      3, 300, 100),
  ('weekly_score_5',      'Five Star Attack',   'Score five goals this week.',                   'weekly',        'goals_scored',     5, 250,  80),
  ('weekly_clean_2',      'Brick Wall',         'Keep 2 clean sheets this week.',                'weekly',        'clean_sheets',     2, 250,  80),
  ('build_overall_85',    'Elite XI',           'Build a team with an overall rating above 85.', 'team_building', 'team_overall',    86, 500, 150),
  ('build_chemistry_80',  'Perfect Harmony',    'Reach 80 team chemistry.',                      'team_building', 'team_chemistry',  80, 300, 100),
  ('collect_rare_5',      'Rare Collector',     'Collect five rare players.',                    'milestone',     'rare_cards_owned', 5, 400, 120),
  ('collect_cards_30',    'Growing Squad',      'Own 30 player cards.',                          'milestone',     'cards_owned',     30, 300, 100);

insert into public.achievements (code, title, description, badge_icon, metric, target, reward_coins, reward_xp) values
  ('first_win',         'First Victory',     'Win your first match.',                 'trophy',   'matches_won',           1, 100,  50),
  ('ten_wins',          'Seasoned Manager',  'Win 10 matches.',                       'medal',    'matches_won',          10, 500, 200),
  ('fifty_goals',       'Goal Machine',      'Score 50 goals in total.',              'flame',    'goals_scored',         50, 500, 200),
  ('first_legendary',   'Living Legend',     'Own a legendary card.',                 'crown',    'legendary_cards_owned', 1, 300, 150),
  ('collector_50',      'Master Collector',  'Own 50 player cards.',                  'library',  'cards_owned',          50, 750, 300),
  ('stadium_level_3',   'Grand Arena',       'Reach stadium level 3.',                'building', 'stadium_level',         3, 400, 150),
  ('level_10',          'Football Legend',   'Reach manager level 10.',               'star',     'user_level',           10, 1000, 0);
