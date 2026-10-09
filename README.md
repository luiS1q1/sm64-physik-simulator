# SM64-Physik-Simulator

Ein kleiner Mario-64-Simulator als Website: die Bewegungsphysik 1:1 aus dem
[SM64-Decomp](https://github.com/n64decomp/sm64) nachgebaut (30-Hz-Logik-Tick,
4 Viertelschritte pro Tick, s16-Winkelsystem, alle Sprung- und Beschleunigungs-
konstanten exakt wie im Original), mit prozeduralem Mario-Modell, kleinem
Testlevel, Gamepad- und Maus-Unterstuetzung und Lakitu-Kamera.

Enthaltene Mechaniken (Original-Werte):

- Gehen/Laufen: Zielgeschwindigkeit min(Stick, 32), Beschleunigung 1.1 - v/43,
  Cap 48
- Sprungkette: Einfach 42 + 0.25v, Doppelsprung 52 + 0.25v, Dreifachsprung 69,
  mit 5-Tick-Landefenster und Forward-Speed-Regeln wie im Decomp
- Rueckwaertssalto (62), Seitwaertssalto (62), Langsprung (30, v * 1.5, Cap 48),
  Wandsprung (62, min 24), Hechtsprung (v + 15, Cap 48), Bodenpound
- Gravitation -4/Tick (Langsprung -2), Terminal -75, variable Sprunghoehe
  (A loslassen und vy > 20: vy /= 4)
- Kollision: Viertelschritte mit Wand-Klassen wie im Decomp (Luft 150/30 bei
  Radius 50, Boden 60/30 bei 50/24), Ledge-Grab-Regeln, Decken-Checks (160)
- Hangabtrieb mit Bodenklassen (1.7 / 2.7 / 5.3 je Slipperiness), Rutschen mit
  den exakten lossFactors (0.98 / 0.96 / 0.92), Steilboden-Regeln (0.866 /
  0.9396926 / 0.9659258)

## Steuerung

Gamepad (Xbox-Schema): linker Stick laufen, A springen, X schlagen/Hecht,
RB/LB/Trigger ducken (Z), rechter Stick Kamera, C-Knoepfe = Schulter-Knoepfe.
Tastatur: WASD + Leertaste (A), F (B), C (Z), Pfeiltasten Kamera, R Respawn,
H HUD, G Debug, I Info. Maus: ziehen = Kamera, Rad = Zoom.

## Quellen

- Physik: https://github.com/n64decomp/sm64 (MIT)
- 3D: https://threejs.org (MIT)

Fanprojekt zum Lernen, kein offizielles Nintendo-Produkt.
