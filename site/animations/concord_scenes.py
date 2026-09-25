"""Explainer animations for the Concord project site.

Render (from this directory):
    manim render -qm --format mp4 concord_scenes.py ConsentLoop WhoKnowsWhat TimelineGuard CoreWakes NativeIntent

Then run ./export.sh to copy the videos and poster frames into ../media/.
Palette matches site/assets/site.css: steel panels, paper text, one amber accent.
"""
from manim import *

BG = "#161B20"
PANEL = "#1E252C"
PANEL_2 = "#28313A"
EDGE = "#46525E"
PAPER = "#E7E3D9"
DIM = "#B4B0A6"
AMBER = "#E3A33A"
BLUE = "#8DB9E8"
GREEN = "#8FBF5A"
RED = "#D8614F"
FONT = "DejaVu Sans"

config.background_color = BG


def T(s, size=24, color=PAPER, weight=NORMAL):
    # Render large and scale down: Pango kerning collapses spaces at small font sizes.
    return Text(s, font=FONT, font_size=size * 4, color=color, weight=weight).scale(0.25)


def panel(w, h, color=PANEL, edge=EDGE):
    return RoundedRectangle(width=w, height=h, corner_radius=0.08, fill_color=color, fill_opacity=1, stroke_color=edge, stroke_width=1.5)


def core_mark(r=0.55):
    ring = Circle(radius=r, color=AMBER, stroke_width=4)
    dot = Dot(radius=r * 0.26, color=AMBER)
    sats = VGroup(*[Dot(radius=r * 0.15, color=AMBER).move_to(ring.point_at_angle(a)) for a in (PI / 2, PI / 2 + TAU / 3, PI / 2 + 2 * TAU / 3)])
    return VGroup(ring, dot, sats)


def pawn(name, color=PAPER):
    head = Circle(radius=0.3, fill_color=PANEL_2, fill_opacity=1, stroke_color=color, stroke_width=2.5)
    body = RoundedRectangle(width=0.8, height=0.45, corner_radius=0.18, fill_color=PANEL_2, fill_opacity=1, stroke_color=color, stroke_width=2.5).next_to(head, DOWN, buff=0.04)
    label = T(name, 18, DIM).next_to(body, DOWN, buff=0.1)
    return VGroup(head, body, label)


def card(text, accent=AMBER, w=None, size=20):
    t = T(text, size)
    box = panel((w or t.width + 0.5), t.height + 0.4, PANEL_2)
    bar = Rectangle(width=0.07, height=box.height, fill_color=accent, fill_opacity=1, stroke_width=0).align_to(box, LEFT)
    t.move_to(box).shift(RIGHT * 0.04)
    return VGroup(box, bar, t)


def chip(text, color):
    t = T(text, 17, color)
    box = RoundedRectangle(width=t.width + 0.35, height=0.42, corner_radius=0.08, stroke_color=color, stroke_width=1.5, fill_color=BG, fill_opacity=1)
    t.move_to(box)
    return VGroup(box, t)


def dim(mark, o):
    """Fade a core mark without filling its ring."""
    return AnimationGroup(mark[0].animate.set_stroke(opacity=o), mark[1].animate.set_fill(opacity=o), mark[2].animate.set_fill(opacity=o))


def caption(s):
    return T(s, 24, PAPER).to_edge(DOWN, buff=0.35)


def heading(s):
    return T(s, 22, AMBER, weight=BOLD).to_corner(UL, buff=0.4)


class ConsentLoop(Scene):
    """Core proposes, pawn decides, the game executes, receipts are the truth."""

    def construct(self):
        self.add(heading("The consent loop"))
        core = core_mark().move_to(LEFT * 4.6 + UP * 1.1)
        core_lbl = T("CORE", 18, AMBER, weight=BOLD).next_to(core, DOWN, buff=0.18)
        alvin = pawn("Alvin").move_to(RIGHT * 3.6 + UP * 1.2)
        others = VGroup(pawn("Beatrice"), pawn("Pedro")).arrange(RIGHT, buff=0.5).scale(0.7).next_to(alvin, RIGHT, buff=0.45).set_opacity(0.45)
        world = panel(12.4, 1.15, PANEL).move_to(DOWN * 2.2)
        world_lbl = T("RimWorld: native jobs, needs, pathing", 18, DIM).move_to(world).align_to(world, LEFT).shift(RIGHT * 0.3)
        self.play(FadeIn(core, scale=0.6), FadeIn(core_lbl), FadeIn(alvin, shift=LEFT * 0.3), FadeIn(others), FadeIn(world), FadeIn(world_lbl), run_time=1.2)

        offer = card("Offer: haul 10 wood, 2 trips").move_to(core.get_center() + RIGHT * 2.9)
        tag = T("proposal", 16, DIM).next_to(offer, UP, buff=0.12)
        self.play(FadeIn(offer, shift=RIGHT * 0.4), FadeIn(tag), run_time=0.8)
        self.play(offer.animate.move_to(alvin.get_center() + LEFT * 3.1), tag.animate.next_to(alvin.get_center() + LEFT * 3.1 + UP * 0.35, UP, buff=0.12), run_time=0.9)

        choices = VGroup(chip("accept", GREEN), chip("counter", AMBER), chip("refuse", RED), chip("not now", BLUE)).arrange(RIGHT, buff=0.18).next_to(alvin, DOWN, buff=0.35).shift(LEFT * 1.2)
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.15) for c in choices], lag_ratio=0.15), run_time=0.9)
        self.play(Indicate(choices[1], color=AMBER, scale_factor=1.15), run_time=0.8)

        counter = card("Counter: 1 trip. My food is low.", AMBER).move_to(alvin.get_center() + LEFT * 3.1)
        self.play(FadeOut(offer), FadeOut(tag), FadeIn(counter), run_time=0.5)
        self.play(counter.animate.move_to(core.get_center() + RIGHT * 3.0), run_time=0.9)
        self.wait(0.4)

        fresh = card("Offer: haul 10 wood, 1 trip").move_to(core.get_center() + RIGHT * 2.9)
        ftag = T("revised offer, fresh consent", 16, DIM).next_to(fresh, UP, buff=0.12)
        self.play(FadeOut(counter), FadeIn(fresh), FadeIn(ftag), run_time=0.5)
        self.play(fresh.animate.move_to(alvin.get_center() + LEFT * 3.1), ftag.animate.next_to(alvin.get_center() + LEFT * 3.1 + UP * 0.35, UP, buff=0.12), run_time=0.9)
        self.play(Indicate(choices[0], color=GREEN, scale_factor=1.15), run_time=0.8)

        # Native execution: a wood stack travels to the stockpile inside the world band.
        stack = Square(0.32, fill_color="#8A6A43", fill_opacity=1, stroke_color="#5E4529", stroke_width=2).move_to(world.get_left() + RIGHT * 6.2)
        pile = DashedVMobject(Square(0.55, color=DIM, stroke_width=2), num_dashes=16).move_to(world.get_right() + LEFT * 1.3)
        pile_lbl = T("stockpile", 14, DIM).next_to(pile, UP, buff=0.08)
        down = Arrow(alvin.get_bottom() + DOWN * 0.9, world.get_top() + RIGHT * 3.6, buff=0.1, color=GREEN, stroke_width=3)
        dtag = T("native job", 16, GREEN).next_to(down, LEFT, buff=0.1)
        self.play(FadeOut(fresh), FadeOut(ftag), GrowArrow(down), FadeIn(dtag), FadeIn(stack), Create(pile), FadeIn(pile_lbl), run_time=0.9)
        self.play(stack.animate.move_to(pile), run_time=1.3)

        receipt = card("RECORD  Alvin · haul completed 1/1 · 10 wood", BLUE, size=18).move_to(LEFT * 3.2 + DOWN * 0.8)
        self.play(FadeIn(receipt, shift=UP * 0.3), run_time=0.7)
        cap = caption("Speech is testimony. Receipts are what happened.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.2)


class WhoKnowsWhat(Scene):
    """Three knowledge scopes: private mind, shared link, the crew log you read."""

    def construct(self):
        self.add(heading("Who knows what"))
        cols = VGroup(*[panel(3.9, 4.6) for _ in range(3)]).arrange(RIGHT, buff=0.35).shift(DOWN * 0.15)
        titles = VGroup(
            T("Alvin's mind", 22, PAPER, weight=BOLD),
            T("Shared link", 22, AMBER, weight=BOLD),
            T("Crew log", 22, BLUE, weight=BOLD),
        )
        subs = VGroup(T("private", 16, DIM), T("core + linked crew", 16, DIM), T("what you watch", 16, DIM))
        for c, t, s in zip(cols, titles, subs):
            t.next_to(c.get_top(), DOWN, buff=0.22)
            s.next_to(t, DOWN, buff=0.08)
        self.play(LaggedStart(*[FadeIn(VGroup(c, t, s), shift=UP * 0.2) for c, t, s in zip(cols, titles, subs)], lag_ratio=0.2), run_time=1.3)

        def rows(col, items, color=PAPER, start=1.45):
            g = VGroup(*[T(i, 18, color) for i in items]).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
            g.next_to(col.get_top(), DOWN, buff=start).align_to(col, LEFT).shift(RIGHT * 0.3)
            return g

        private = rows(cols[0], ["Food 0.40, falling", "Traits, skills, memories", "Outlook: \"finish what", "   I start matters\""])
        self.play(LaggedStart(*[FadeIn(r, shift=RIGHT * 0.15) for r in private], lag_ratio=0.2), run_time=1.2)

        band = T("Alvin: Food low", 18, AMBER)
        band.move_to(private[0])
        shared_slot = rows(cols[1], ["x"])[0]
        self.play(TransformFromCopy(private[0], band), run_time=0.4)
        self.play(band.animate.move_to(shared_slot.get_center()).align_to(shared_slot, LEFT), run_time=1.0)
        note = T("coarse band, not the meter", 16, DIM).next_to(band, DOWN, buff=0.08).align_to(band, LEFT)
        self.play(FadeIn(note), run_time=0.4)

        lock = VGroup(
            RoundedRectangle(width=0.34, height=0.26, corner_radius=0.04, fill_color=RED, fill_opacity=1, stroke_width=0),
            Arc(radius=0.12, start_angle=0, angle=PI, color=RED, stroke_width=4).shift(UP * 0.14),
        ).next_to(VGroup(private[2], private[3]), RIGHT, buff=0.15)
        self.play(FadeIn(lock, scale=0.5), Indicate(VGroup(private[2], private[3]), color=RED, scale_factor=1.05), run_time=0.8)

        msg = T("Alvin: \"I'm getting hungry\"", 17, PAPER)
        msg.next_to(note, DOWN, buff=0.35).align_to(band, LEFT)
        msg_log = T("MESSAGE Alvin → Core", 16, AMBER)
        rec_log = T("RECORD haul 1/1 · 10 wood", 16, BLUE)
        logrows = VGroup(msg_log, rec_log).arrange(DOWN, aligned_edge=LEFT, buff=0.25).next_to(cols[2].get_top(), DOWN, buff=1.45).align_to(cols[2], LEFT).shift(RIGHT * 0.3)
        self.play(FadeIn(msg, shift=RIGHT * 0.2), run_time=0.6)
        self.play(TransformFromCopy(msg, msg_log), run_time=0.8)
        progress = T("Agreement: 1/1 trips", 16, PAPER).next_to(msg, DOWN, buff=0.25).align_to(msg, LEFT)
        self.play(FadeIn(progress), FadeIn(rec_log, shift=UP * 0.15), run_time=0.7)

        eye = core_mark(0.28).next_to(cols[1], UP, buff=0.12)
        self.play(FadeIn(eye, scale=0.5), cols[1].animate.set_stroke(AMBER, width=2.5), run_time=0.6)
        cap = caption("The core sees what an attentive crewmate could see. Never thoughts.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.4)


class TimelineGuard(Scene):
    """Checkpoints fork timelines; stale or duplicate answers can't act twice."""

    def construct(self):
        self.add(heading("Saves, reloads and slow thoughts"))
        y = 0.9
        line = Line(LEFT * 6 + UP * y, RIGHT * 6 + UP * y, color=EDGE, stroke_width=4)
        e1 = T("epoch 1", 18, DIM).next_to(line.get_left(), UP, buff=0.15).align_to(line, LEFT)
        self.play(Create(line), FadeIn(e1), run_time=1.0)

        def diamond(x, yy, label):
            d = Square(0.28, fill_color=AMBER, fill_opacity=1, stroke_width=0).rotate(PI / 4).move_to(RIGHT * x + UP * yy)
            l = T(label, 16, AMBER).next_to(d, UP, buff=0.12)
            return VGroup(d, l)

        c1 = diamond(-3, y, "checkpoint")
        self.play(FadeIn(c1, scale=0.5), run_time=0.5)

        thinking = VGroup(Dot(color=PAPER, radius=0.1), T("Alvin deliberating…", 16, DIM)).arrange(RIGHT, buff=0.15).move_to(RIGHT * 0.8 + UP * (y + 0.9))
        self.play(FadeIn(thinking), run_time=0.5)

        # Restore to the checkpoint: a new epoch branches below.
        branch = VMobject(color=GREEN, stroke_width=4)
        branch.set_points_as_corners([RIGHT * -3 + UP * y, RIGHT * -2.2 + DOWN * 1.0, RIGHT * 6 + DOWN * 1.0])
        e2 = T("restore → epoch 2", 18, GREEN).next_to(RIGHT * -2.2 + DOWN * 1.0, DOWN, buff=0.2).shift(RIGHT * 0.9)
        self.play(Create(branch), FadeIn(e2), line.animate.set_color("#39424B"), run_time=1.2)

        # The old answer arrives late and is refused by the epoch check.
        answer = card("accept (epoch 1)", GREEN, size=16).move_to(thinking.get_center())
        self.play(FadeOut(thinking), FadeIn(answer), run_time=0.4)
        self.play(answer.animate.move_to(RIGHT * 3 + DOWN * 1.0), run_time=1.0)
        cross = VGroup(Line(UL * 0.3, DR * 0.3, color=RED, stroke_width=7), Line(UR * 0.3, DL * 0.3, color=RED, stroke_width=7)).move_to(answer)
        why = T("stale epoch: rejected, no job", 18, RED).next_to(answer, DOWN, buff=0.3)
        self.play(FadeIn(cross, scale=1.4), FadeIn(why), run_time=0.6)
        self.wait(0.6)
        self.play(FadeOut(answer), FadeOut(cross), FadeOut(why), run_time=0.4)

        # Duplicate delivery of one action ID is deduplicated by the game's ledger.
        a1 = card("action #7 → haul", BLUE, size=16).move_to(LEFT * 0.4 + DOWN * 2.3)
        a2 = a1.copy().shift(RIGHT * 3.4)
        self.play(FadeIn(a1, shift=UP * 0.2), run_time=0.5)
        ok = T("applied once", 16, GREEN).next_to(a1, DOWN, buff=0.15)
        self.play(FadeIn(ok), FadeIn(a2, shift=UP * 0.2), run_time=0.6)
        dup = T("same ID: no second effect", 16, DIM).next_to(a2, DOWN, buff=0.15)
        self.play(a2.animate.set_opacity(0.35), FadeIn(dup), run_time=0.6)

        cap = caption("A restore forks the timeline. Old answers can't reach into the new one.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.2)


class CoreWakes(Scene):
    """Event-driven core: shared events spend a turn; telemetry waits silently unless it turns urgent."""

    def construct(self):
        self.add(heading("The core wakes on shared events"))
        y = 0.35
        axis = Line(LEFT * 6.2 + UP * y, RIGHT * 6.2 + UP * y, color=EDGE, stroke_width=3)
        tl = T("game time →", 14, DIM).next_to(axis.get_left(), DOWN, buff=0.75).align_to(axis, LEFT)
        core = core_mark(0.45).move_to(LEFT * 5 + UP * 2.3)
        core[0].set_stroke(opacity=0.35)
        core[1:].set_fill(opacity=0.35)
        clbl = T("core: asleep", 18, DIM).next_to(core, RIGHT, buff=0.3)
        budget_lbl = T("turn budget", 16, DIM).move_to(RIGHT * 3.6 + UP * 2.6)
        pips = VGroup(*[Square(0.26, fill_color=AMBER, fill_opacity=1, stroke_width=0) for _ in range(5)]).arrange(RIGHT, buff=0.1).next_to(budget_lbl, DOWN, buff=0.15)
        rule = T("Wakes it: messages · answers · finished or stopped work · requests · offer/counter openings", 15, DIM).move_to(UP * 1.35)

        status_box = panel(5.4, 1.75).move_to(LEFT * 3.6 + DOWN * 1.98)
        log_box = panel(6.9, 1.75).move_to(RIGHT * 2.85 + DOWN * 1.98)
        status_t = T("Status line", 16, AMBER, weight=BOLD).next_to(status_box.get_corner(UL), DR, buff=0.2)
        log_t = T("Crew log", 16, BLUE, weight=BOLD).next_to(log_box.get_corner(UL), DR, buff=0.2)
        status = T("Core: idle", 17, DIM).next_to(status_t, DOWN, buff=0.35, aligned_edge=LEFT)
        self.play(Create(axis), FadeIn(tl), FadeIn(core), FadeIn(clbl), FadeIn(budget_lbl), FadeIn(pips),
                  FadeIn(VGroup(status_box, log_box, status_t, log_t, status)), run_time=1.0)
        self.play(FadeIn(rule, shift=DOWN * 0.1), run_time=0.6)

        def set_status(text, color=PAPER):
            new = T(text, 17, color).move_to(status, aligned_edge=LEFT)
            return Transform(status, new)

        log_rows = []

        def log_row(text):
            r = T(text, 15, PAPER)
            anchor = log_rows[-1] if log_rows else log_t
            r.next_to(anchor, DOWN, buff=0.35 if not log_rows else 0.14, aligned_edge=LEFT)
            log_rows.append(r)
            return r

        # (x, label, kind, turn, status line after, crew-log entry or None)
        events = [
            (-4.8, "haul finished", "wake", "propose", "Core: waiting on Alvin's answer", "PROPOSAL Core → Alvin: haul 20 wood"),
            (-3.1, "Food band: ok → low", "silent", "silent: status only", "Core: waiting on Alvin (Food: low)", None),
            (-1.4, "Alvin: \"not now\"", "wake", "wait", "Core: waiting on Alvin, deferred", None),
            (0.3, "idle hour", "none", "no call", None, None),
            (2.0, "Rest band → URGENT", "urgent", "check in", "Core: waiting on Beatrice", "MESSAGE Core → Beatrice: rest first"),
            (3.7, "private need", "none", "no call", None, None),
            (5.4, "Pedro asks for work", "wake", "offer", "Core: waiting on Pedro's answer", "OFFER Core → Pedro: cook dinner"),
        ]
        used = 0
        for x, label, kind, turn, stat, entry in events:
            wakes = kind in ("wake", "urgent")
            col = RED if kind == "urgent" else (AMBER if wakes else EDGE)
            mark = Dot(RIGHT * x + UP * y, color=col, radius=0.12)
            lbl = T(label, 16, RED if kind == "urgent" else (PAPER if wakes else DIM)).next_to(mark, DOWN, buff=0.25 if wakes else 0.7)
            self.play(FadeIn(mark, scale=0.4), FadeIn(lbl), run_time=0.5)
            if wakes:
                awake = T("core: awake", 18, AMBER).move_to(clbl, aligned_edge=LEFT)
                beam = DashedLine(mark.get_center(), core.get_bottom(), color=col, stroke_width=2)
                self.play(Create(beam), dim(core, 1), Transform(clbl, awake), run_time=0.5)
                act = T(turn, 16, AMBER).next_to(mark, UP, buff=0.3)
                self.play(FadeIn(act, shift=UP * 0.1), pips[used].animate.set_fill(EDGE), run_time=0.5)
                used += 1
                if entry:
                    self.play(FadeIn(log_row(entry), shift=RIGHT * 0.15), set_status(stat), run_time=0.6)
                else:
                    note = T("wait turn: no log entry", 14, DIM).next_to(log_t, RIGHT, buff=0.4)
                    self.play(set_status(stat), Indicate(status, color=AMBER, scale_factor=1.05), FadeIn(note), run_time=0.6)
                    self.wait(0.3)
                    self.play(FadeOut(note), run_time=0.3)
                asleep = T("core: asleep", 18, DIM).move_to(clbl, aligned_edge=LEFT)
                self.play(FadeOut(beam), dim(core, 0.35), Transform(clbl, asleep), run_time=0.4)
            else:
                z = T(turn, 14, DIM).next_to(mark, UP, buff=0.3)
                if stat:
                    quiet = T("telemetry: consumed silently, no core call, no log", 14, DIM).next_to(status_box.get_bottom(), UP, buff=0.2).align_to(status, LEFT)
                    self.play(FadeIn(z), set_status(stat, DIM), FadeIn(quiet), run_time=0.6)
                else:
                    self.play(FadeIn(z), run_time=0.4)
        cap = caption("Shared events spend a turn. Telemetry waits silently, unless it turns urgent.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.4)


class NativeIntent(Scene):
    """Agreements become tagged zones; RimWorld's work givers do the jobs; receipts credit the quota."""

    def construct(self):
        self.add(heading("Steer the planner, don't drive the pawn"))

        # Before: the coordinator hand-built one ordered job per trip.
        before = T("Before: one hand-built job per trip", 18, DIM).move_to(UP * 2.5)
        core0 = core_mark(0.45).move_to(LEFT * 4.8 + UP * 0.9)
        alvin0 = pawn("Alvin").move_to(RIGHT * 3.8 + UP * 0.9)
        job = card("Job: this stack → this cell, 10 wood", BLUE, size=18).next_to(core0, RIGHT, buff=0.4)
        self.play(FadeIn(before), FadeIn(core0, scale=0.6), FadeIn(alvin0, shift=LEFT * 0.3), run_time=0.8)
        self.play(FadeIn(job, shift=RIGHT * 0.3), run_time=0.5)
        self.play(job.animate.next_to(alvin0, LEFT, buff=0.4), run_time=0.8)
        meter = Rectangle(width=2.4, height=0.22, fill_color=PANEL_2, fill_opacity=1, stroke_color=EDGE, stroke_width=1.5).next_to(alvin0, DOWN, buff=0.35)
        fill = Rectangle(width=2.4 * 0.6, height=0.22, fill_color=GREEN, fill_opacity=1, stroke_width=0).align_to(meter, LEFT).align_to(meter, DOWN)
        tick = Line(meter.get_corner(DL) + RIGHT * 2.4 * 0.35 + DOWN * 0.08, meter.get_corner(UL) + RIGHT * 2.4 * 0.35 + UP * 0.08, color=PAPER, stroke_width=2)
        mlbl = T("Food", 14, DIM).next_to(meter, LEFT, buff=0.15)
        tlbl = T("35%", 12, DIM).next_to(tick, DOWN, buff=0.06)
        self.play(FadeIn(VGroup(meter, fill, tick, mlbl, tlbl)), run_time=0.4)
        self.play(fill.animate.stretch_to_fit_width(2.4 * 0.3).align_to(meter, LEFT).set_fill(RED), run_time=0.9)
        stop = T("haul stopped at Food < 35%", 18, RED).next_to(tlbl, DOWN, buff=0.2).set_x(alvin0.get_x())
        self.play(FadeIn(stop), job.animate.set_opacity(0.3), run_time=0.5)
        meal = T("meal eaten → agreement not resumed", 16, DIM).next_to(stop, DOWN, buff=0.15)
        self.play(fill.animate.stretch_to_fit_width(2.4 * 0.8).align_to(meter, LEFT).set_fill(GREEN), FadeIn(meal), run_time=0.8)
        self.wait(0.7)
        self.play(*[FadeOut(m) for m in (before, core0, alvin0, job, meter, fill, tick, mlbl, tlbl, stop, meal)], run_time=0.5)

        # Now: offer to capable pawns, with fresh consent.
        core = core_mark(0.4).move_to(LEFT * 5.9 + UP * 2.35)
        core_lbl = T("CORE", 15, AMBER, weight=BOLD).next_to(core, DOWN, buff=0.12)
        alvin, bea, pedro = [pawn(n).scale(0.8) for n in ("Alvin", "Beatrice", "Pedro")]
        for p, x in ((alvin, 1.3), (bea, 3.4), (pedro, 5.5)):
            p.move_to(RIGHT * x + UP * 2.2)
        world = panel(8.0, 2.8).move_to(LEFT * 2.4 + DOWN * 1.45)
        wlbl = T("Map (game state)", 14, DIM).next_to(world.get_corner(UL), DR, buff=0.15)
        stacks = VGroup(*[Square(0.3, fill_color="#8A6A43", fill_opacity=1, stroke_color="#5E4529", stroke_width=2) for _ in range(4)])
        for s_, pos in zip(stacks, ((-5.7, -1.1), (-5.0, -1.9), (-5.6, -2.45), (-4.6, -1.3))):
            s_.move_to(RIGHT * pos[0] + UP * pos[1])
        ledger = panel(4.2, 2.8).move_to(RIGHT * 4.3 + DOWN * 1.45)
        self.play(FadeIn(core, scale=0.6), FadeIn(core_lbl), LaggedStart(*[FadeIn(p, shift=DOWN * 0.2) for p in (alvin, bea, pedro)], lag_ratio=0.15),
                  FadeIn(world), FadeIn(wlbl), FadeIn(stacks), FadeIn(ledger), run_time=1.1)

        offer = card("Offer: haul up to 75 wood to the shared pile", size=17).next_to(core, RIGHT, buff=0.35)
        otag = T("to pawns who can haul", 15, DIM).next_to(offer, UP, buff=0.1).align_to(offer, LEFT)
        self.play(FadeIn(offer, shift=RIGHT * 0.3), FadeIn(otag), run_time=0.8)
        anote = T("not offered:\ncannot do hauling", 15, DIM).next_to(alvin, DOWN, buff=0.15)
        pnote = T("not asked", 15, DIM).next_to(pedro, DOWN, buff=0.15)
        self.play(alvin.animate.set_opacity(0.35), FadeIn(anote), FadeIn(pnote), run_time=0.7)
        arc = CurvedArrow(offer.get_right() + UP * 0.25, bea.get_top() + UP * 0.05, angle=-PI / 3, color=AMBER, stroke_width=3, tip_length=0.18)
        self.play(Create(arc), run_time=0.7)
        acc = chip("accept", GREEN).next_to(bea, DOWN, buff=0.15)
        fresh = T("fresh consent", 14, DIM).next_to(acc, DOWN, buff=0.08)
        self.play(FadeIn(acc, shift=UP * 0.15), FadeIn(fresh), run_time=0.6)
        self.play(Indicate(acc, color=GREEN, scale_factor=1.15), run_time=0.6)

        # The accepted agreement becomes a tagged stockpile zone on the map.
        zone = Rectangle(width=2.6, height=1.8, fill_color=AMBER, fill_opacity=0.1, stroke_color=AMBER, stroke_width=3).move_to(RIGHT * 0.1 + DOWN * 1.33)
        zlbl = T("Shared: wood", 17, AMBER, weight=BOLD).next_to(zone.get_top(), DOWN, buff=0.12)
        ztag = T("tag: agreement #12", 13, AMBER).next_to(zlbl, DOWN, buff=0.06)
        self.play(FadeOut(arc), FadeOut(otag), ReplacementTransform(offer[0], zone), FadeOut(offer[1]), FadeTransform(offer[2], zlbl), run_time=1.4)
        self.play(FadeIn(ztag), run_time=0.4)
        lab = T("intent lives on the map", 14, DIM).next_to(zone, UP, buff=0.12)
        self.play(FadeIn(lab), run_time=0.4)

        # Ledger.
        lt = T("Quota ledger", 17, PAPER, weight=BOLD).next_to(ledger.get_corner(UL), DR, buff=0.2)
        count = T("0 / 75", 22, AMBER, weight=BOLD).next_to(ledger.get_corner(UR), DL, buff=0.2)
        unit = 3.6 / 75
        bar_bg = Rectangle(width=3.6, height=0.3, fill_color=PANEL_2, fill_opacity=1, stroke_color=EDGE, stroke_width=1).move_to(ledger.get_center() + UP * 0.35)
        rows = VGroup(T("Beatrice", 16, BLUE), T("Pedro", 16, GREEN), T("reserved", 16, DIM)).arrange(DOWN, aligned_edge=LEFT, buff=0.14).next_to(bar_bg, DOWN, buff=0.22).align_to(bar_bg, LEFT)
        nums = VGroup(*[T("0", 16, c) for c in (BLUE, GREEN, DIM)])
        for n, r in zip(nums, rows):
            n.align_to(bar_bg, RIGHT).set_y(r.get_y())
        rule = T("credited + reserved ≤ 75", 14, DIM).next_to(ledger.get_bottom(), UP, buff=0.18)

        def bar(bc, pc, br, pr):
            segs = VGroup()
            x0 = bar_bg.get_left()[0]
            for v, c, o in ((bc, BLUE, 1), (pc, GREEN, 1), (br, BLUE, 0.35), (pr, GREEN, 0.35)):
                w = max(v * unit, 0.001)
                r = Rectangle(width=w, height=0.3, fill_color=c, fill_opacity=o if v else 0, stroke_width=0)
                r.move_to(RIGHT * (x0 + w / 2) + UP * bar_bg.get_y())
                segs.add(r)
                x0 += v * unit
            return segs

        segs = bar(0, 0, 0, 0)
        self.play(FadeIn(VGroup(lt, count, bar_bg, rows, nums, rule, segs)), run_time=0.6)

        def ledger_to(bc, pc, br, pr):
            vals = (bc, pc, br + pr)
            anims = [Transform(segs, bar(bc, pc, br, pr)), Transform(count, T(f"{bc + pc} / 75", 22, AMBER, weight=BOLD).move_to(count, aligned_edge=RIGHT))]
            for n, v, c in zip(nums, vals, (BLUE, GREEN, DIM)):
                anims.append(Transform(n, T(str(v), 16, c).move_to(n, aligned_edge=RIGHT)))
            return anims

        # Pawns fulfil it through RimWorld's own work givers.
        wg = chip("RimWorld work givers → native jobs", GREEN).move_to(LEFT * 2.4 + UP * 0.45)
        btok = VGroup(Circle(0.2, fill_color=PANEL_2, fill_opacity=1, stroke_color=BLUE, stroke_width=3), T("B", 14, BLUE, weight=BOLD)).move_to(LEFT * 3.9 + DOWN * 2.2)
        ptok = VGroup(Circle(0.2, fill_color=PANEL_2, fill_opacity=1, stroke_color=GREEN, stroke_width=3), T("P", 14, GREEN, weight=BOLD)).move_to(LEFT * 3.6 + DOWN * 0.8)
        pnote2 = T("helping, not asked", 15, GREEN).move_to(pnote)
        self.play(FadeIn(wg, shift=DOWN * 0.1), FadeOut(lab), TransformFromCopy(bea[0], btok), TransformFromCopy(pedro[0], ptok), Transform(pnote, pnote2), run_time=1.0)

        slots = [zone.get_center() + v for v in (LEFT * 0.45 + DOWN * 0.1, RIGHT * 0.45 + DOWN * 0.1, LEFT * 0.45 + DOWN * 0.55, RIGHT * 0.45 + DOWN * 0.55)]

        def to_stack(tok, st):
            return tok.animate.move_to(st.get_center() + RIGHT * 0.38)

        def haul(tok, st, slot):
            return [st.animate.move_to(slot), tok.animate.move_to(slot + RIGHT * 0.38 + UP * 0.02)]

        # Round 1: two reservations at once.
        self.play(to_stack(btok, stacks[1]), to_stack(ptok, stacks[0]), *ledger_to(0, 0, 20, 25), run_time=0.9)
        self.play(*haul(btok, stacks[1], slots[0]), *haul(ptok, stacks[0], slots[1]), run_time=1.3)
        self.play(*ledger_to(20, 25, 0, 0), run_time=0.6)

        # Round 2: Beatrice breaks for a meal; Pedro keeps hauling.
        table = VGroup(Rectangle(width=0.5, height=0.3, fill_color=PANEL_2, fill_opacity=1, stroke_color=DIM, stroke_width=1.5), T("meal", 12, DIM)).move_to(LEFT * 2.6 + DOWN * 0.55)
        table[1].next_to(table[0], DOWN, buff=0.05)
        care = T("self-care", 14, BLUE).move_to(table[0].get_center() + LEFT * 1.35)
        self.play(FadeIn(table), btok.animate.move_to(table[0].get_center() + LEFT * 0.45), to_stack(ptok, stacks[3]), *ledger_to(20, 25, 0, 15), run_time=0.9)
        self.play(FadeIn(care), *haul(ptok, stacks[3], slots[2]), run_time=1.2)
        self.play(*ledger_to(20, 40, 0, 0), run_time=0.6)
        znote = T("tag on the zone, not the wood", 13, DIM).next_to(zone, DOWN, buff=0.1).set_x(zone.get_x() - 0.1)
        self.play(FadeIn(znote), Indicate(ztag, color=AMBER, scale_factor=1.2), run_time=0.8)

        # Round 3: Beatrice returns and takes the last 15.
        self.play(FadeOut(care), to_stack(btok, stacks[2]), *ledger_to(20, 40, 15, 0), run_time=0.9)
        self.play(*haul(btok, stacks[2], slots[3]), run_time=1.2)
        self.play(*ledger_to(35, 40, 0, 0), run_time=0.6)

        refuse = VGroup(Square(0.14, fill_color=RED, fill_opacity=1, stroke_width=0), T("refused or deferred → never tagged work", 15, DIM)).arrange(RIGHT, buff=0.15).move_to(RIGHT * 4.3 + UP * 0.45)
        self.play(FadeIn(refuse, shift=UP * 0.1), run_time=0.6)
        self.wait(0.6)

        # Retirement record.
        done = card("Agreement complete: 75 of 75\n(Pedro 40, Beatrice 35).\nFurther hauling here is ordinary work.", BLUE, size=16).next_to(core, RIGHT, buff=0.3)
        retired = T("tag retired", 13, DIM).move_to(ztag)
        self.play(FadeIn(done, shift=UP * 0.2), Transform(ztag, retired), zone.animate.set_stroke(DIM).set_fill(opacity=0.05), run_time=0.9)
        cap = caption("The intent is state on the map. Receipts decide the credit.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.6)
