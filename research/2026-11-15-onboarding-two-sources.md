# Onboarding: two sources the user shared (2026-11-15)

Read on 2026-11-15. Both are secondary sources (a newsletter and a teardown), not Duolingo's own words.

- A: Antonio Ferrara, "How to design the onboarding in subscription apps", https://antoniodesigns.substack.com/p/how-to-design-the-onboarding-in-subscription (free part of the post; the app case studies are for subscribers only).
- B: Samuel Hulick, "How Duolingo Onboards New Users", UserOnboard, January 2015, https://www.useronboard.com/how-duolingo-activates-users/ (about 70 annotated slides of the 2015 web app).

## A. The newsletter's rules

- The goal of onboarding is the first "aha" moment, not getting through it fast. Everyone sees it, and motivation is at its highest there.
- Three principles:
  1. **Increase value.** If doing the first session predicts long-term use, do it inside onboarding. Give an immediate reward. Make it feel personal. Let people build their own version of the product, which uses the Ikea effect.
  2. **Reduce cognitive friction.** Split onboarding into chunks with clear progress. Ask a few low-friction questions first. Use clear graphics instead of text.
  3. **Create a mental model.** Answer "how will this fit into my life?". Set honest expectations without overpromising. Introduce features only when they're needed.
- Mistake 1 is removing friction no matter what. Don't offer a skip unless you're fine with people never doing that part.
- Mistake 2 is giving information instead of driving action. Make onboarding easy and interactive.

## B. Duolingo's flow, slide by slide

1. **Landing page.** A lone globe, "Learn a language for free. Forever." and one button, with nothing else to focus on. Praised for the clarity of a single call to action.
2. **"I want to learn…" list.** It's written in the first person, which gives a sense of ownership. There's no form and no name, email or password. The author contrasts this with a "First, Last, Email, Password" form.
3. **Duo says "Welcome to Duolingo!"** next to a "Start tour" button. Praised as using personality to make an emotional connection right away. Criticised on two counts: the progress bar starts empty, where some free "gimme" progress would help, and "Start tour" sounds like a chore. "See how Duolingo works" is suggested instead.
4. **Learn by doing straight away.** The screen says "Click or hover over these words", the user does it, and gets "Good job!" at once. The author: "Having users learn by doing is so much more immersive than just saying 'you can hover over words'."
5. **An immediate real challenge.** The user translates "Hello, my name is Duo." and gets "You are correct" with a green bar. The author: "it felt like that [all by myself] and from a design perspective that's kind of all that matters."
6. **Daily goal.** The user picks a commitment such as Casual or Regular, and the email for reminders sits on the same screen. Praised because people keep to what they said they'd do. Criticised because "XP" hasn't been explained yet, and because the progress bar is completely full, leaving nothing to finish.
7. **Course map**, with a "Test out" option for people who already know some of the language.
8. **First lesson.** Easy picture questions ("Select translation of 'a girl'"), each answer confirmed, and Duo's tips at the side. It gets a little harder as it goes.
9. **"Lesson complete! +10 XP"**, the daily goal ring full, and a chart.
10. **Sign-up comes last:** "Save your progress" with a safe icon. The author: "Of COURSE I'm going to create a profile now!", because they already have something worth keeping.

Also criticised: a "Report a problem" link right next to a congratulation message.

## What this means for Cluster

| Pattern | Cluster today | Change |
|---|---|---|
| Learn by doing before anything else | Setup asks three questions about mail in general | Step 1 asks about the user's own senders: "Where does Amazon go?" (step 8 of research/2026-11-15-kai-duolingo-onboarding.md). Both sources point here |
| Instant feedback on every action | Kai nods and the emoji floats up | Add a short green "Got it" row under each answered sender, like Duolingo's "You are correct" bar |
| Progress starts with a little done | Dots start empty | The first dot starts filled (sign-in counts as done), so the bar is never at zero |
| Commitment, then reward | Labels made, then Kai cheers | Keep the cheer, and add a first number: "1,240 emails will find their labels" |
| Ask for things only once there's value | Gmail sign-in comes first, which can't move | No change. Notifications are already asked on Start |
| Name buttons by what you get | "Continue", "Start" | "Start" becomes "Sort my inbox" |
| No skip unless you're fine never doing it | "I'll set it up myself" on every step | Keep it, but quieter (gray, smaller) |
| Clear graphics over text | Emoji tiles | Keep, and use real sender logos (favicons) in learn by doing |
