"""Explainer animations for the Concord project site.

Render (from this directory):
    manim render -qm --format mp4 concord_scenes.py ConsentLoop WhoKnowsWhat TimelineGuard CoreWakes

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
    return Text(s, font=FONT, font_size=size, color=color, weight=weight)


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
    """Event-driven core: shared events wake it, passing time does not, within a budget."""

    def construct(self):
        self.add(heading("The core wakes on shared events"))
        y = -0.3
        axis = Line(LEFT * 6 + UP * y, RIGHT * 6 + UP * y, color=EDGE, stroke_width=3)
        tl = T("game time →", 16, DIM).next_to(axis.get_right(), UP, buff=0.9).align_to(axis, RIGHT)
        core = core_mark(0.45).move_to(LEFT * 5 + UP * 2.2)
        core[0].set_stroke(opacity=0.35)
        core[1:].set_fill(opacity=0.35)
        clbl = T("core: asleep", 18, DIM).next_to(core, RIGHT, buff=0.3)
        budget_lbl = T("turn budget", 16, DIM).move_to(RIGHT * 3.3 + UP * 2.6)
        pips = VGroup(*[Square(0.26, fill_color=AMBER, fill_opacity=1, stroke_width=0) for _ in range(4)]).arrange(RIGHT, buff=0.1).next_to(budget_lbl, DOWN, buff=0.15)
        self.play(Create(axis), FadeIn(tl), FadeIn(core), FadeIn(clbl), FadeIn(budget_lbl), FadeIn(pips), run_time=1.0)

        events = [
            (-4.8, "haul completed", True),
            (-2.4, "time passes", False),
            (0.0, "Alvin: \"not now\"", True),
            (2.4, "private need shift", False),
            (4.8, "reply received", True),
        ]
        used = 0
        for x, label, wakes in events:
            mark = Dot(RIGHT * x + UP * y, color=AMBER if wakes else EDGE, radius=0.12)
            lbl = T(label, 16, PAPER if wakes else DIM).next_to(mark, DOWN, buff=0.25 if wakes else 0.7)
            self.play(FadeIn(mark, scale=0.4), FadeIn(lbl), run_time=0.5)
            if wakes:
                awake = T("core: awake", 18, AMBER)
                awake.move_to(clbl, aligned_edge=LEFT)
                beam = DashedLine(mark.get_center(), core.get_bottom(), color=AMBER, stroke_width=2)
                self.play(Create(beam), dim(core, 1), Transform(clbl, awake), run_time=0.5)
                act = T(["propose", "wait", "follow up"][used], 16, AMBER).next_to(mark, UP, buff=0.3)
                self.play(FadeIn(act, shift=UP * 0.1), pips[used].animate.set_fill(EDGE), run_time=0.5)
                used += 1
                asleep = T("core: asleep", 18, DIM).move_to(clbl, aligned_edge=LEFT)
                self.play(FadeOut(beam), dim(core, 0.35), Transform(clbl, asleep), run_time=0.4)
            else:
                z = T("no call", 14, DIM).next_to(mark, UP, buff=0.3)
                self.play(FadeIn(z), run_time=0.4)
        cap = caption("Public changes wake it. Private needs and idle time don't. Every turn is budgeted.")
        self.play(FadeIn(cap), run_time=0.7)
        self.wait(2.2)
