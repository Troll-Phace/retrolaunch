INSERT OR IGNORE INTO systems (id, name, manufacturer, short_name, generation, extensions, header_offset, header_magic, theme_color) VALUES
('nes', 'Nintendo Entertainment System', 'Nintendo', 'NES', 3, '["nes","unf","unif"]', 0, '4E45531A', '#e60012'),
('snes', 'Super Nintendo Entertainment System', 'Nintendo', 'SNES', 4, '["sfc","smc","fig","swc"]', 32704, NULL, '#7c3aed'),
('genesis', 'Sega Genesis / Mega Drive', 'Sega', 'Genesis', 4, '["md","gen","bin","smd"]', 256, '53454741', '#0066ff'),
('n64', 'Nintendo 64', 'Nintendo', 'N64', 5, '["n64","z64","v64"]', 0, NULL, '#00963f'),
('gb', 'Game Boy', 'Nintendo', 'GB', 4, '["gb"]', 260, NULL, '#8bac0f'),
('gbc', 'Game Boy Color', 'Nintendo', 'GBC', 5, '["gbc"]', 323, NULL, '#8bac0f'),
('gba', 'Game Boy Advance', 'Nintendo', 'GBA', 6, '["gba","agb"]', 4, NULL, '#5b3c88'),
('ps1', 'PlayStation', 'Sony', 'PS1', 5, '["bin","cue","chd","iso","pbp"]', -1, NULL, '#003087'),
('saturn', 'Sega Saturn', 'Sega', 'Saturn', 5, '["iso","bin","cue"]', -1, '53454741205345474153415455524E', '#ff6600'),
('neogeo', 'Neo Geo', 'SNK', 'Neo Geo', 4, '["zip"]', -1, NULL, '#c8102e'),
('atari2600', 'Atari 2600', 'Atari', 'Atari 2600', 2, '["a26","bin"]', -1, NULL, '#8b6914'),
('ps2', 'PlayStation 2', 'Sony', 'PS2', 6, '["iso","bin","chd","cso","ciso"]', -1, NULL, '#003791'),
('gamecube', 'Nintendo GameCube', 'Nintendo', 'GCN', 6, '["iso","gcm","ciso"]', 28, 'C2339F3D', '#6a0dad'),
('nds', 'Nintendo DS', 'Nintendo', 'NDS', 7, '["nds","srl","dsi"]', -1, NULL, '#a0a0a0');

-- Keep extensions up-to-date on existing databases (INSERT OR IGNORE skips existing rows).
UPDATE systems SET extensions = '["iso","bin","chd","cso","ciso"]' WHERE id = 'ps2';
UPDATE systems SET extensions = '["iso","gcm","ciso"]' WHERE id = 'gamecube';
