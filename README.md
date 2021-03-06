# CrowdX: Tiny MobX-style reactivity package

## What is this?

I created this because I'm a huge fan of MobX, but the "magic" that goes into 
it - while simple at its heart - may not be clear to everybody, and can be a 
turn-off for some. So I wanted to create a minimal demonstration of the 
principles to rob them of their mystery, and hopefully make more people 
comfortable using this kind of paradigm.

Secondarily: this was a learning experience for me to more thoroughly 
test/explore my own understanding of MobX's concepts. I gained some clarity by 
stripping things down to their simplest possible form.

Thirdly: it's... really small. MobX itself is no behemoth, but this appears 
to be less than 1/5 its size. CrowdX doesn't have as many bells and whistles, of 
course, but the core is there. So if you want an extremely tiny but still 
powerful reactivity library, this could be just the ticket.

For an example of how to use it, take a look at `example.html`. The example is
done with vanilla JS, but it should translate very directly to React or 
whichever unopinionated rendering library you'd like to use.

## Usage

```
npm install --save crowdx
```
```javascript
import { observable, reaction } from "/crowdx.mjs";

const appState = observable({
    firstName: "Bob",
    lastName: "Belcher",
    age: 42
})

reaction(
    () => `
        <div>
            ${appState.lastName}, ${appState.firstName} | Age ${appState.age}
        </div>
    `,
    html => {
        document.body.innerHTML = html
    })

setInterval(() => {
    appState.age = Math.random() * 100;
}, 1000)
```

## Project goals (in order)
1. Being a good, thoroughly-commented demonstration of the principles behind 
MobX
2. Being a simple and minimal library: no bells and whistles, just the core 
mechanisms, smallest footprint possible (except when that conflicts with 
point #1)

## Non-goals
1. Have wide browser support - CrowdX uses Proxy, Set, Map, class syntax, and is 
even shipped as an ES module. It doesn't work on IE. It should work on 
recent-ish versions of major browsers. You could probably stretch support with
some combination of polyfills, babel, and webpack, but improving/maintaining
browser reach is not a project priority (it does work in NodeJS, though!).
2. Being super convenient - MobX comes with lots of fancy utility functions 
built atop the core logic, and also things like decorator support, to maximize convenience for
application developers. That's great, I love those things, but this project is 
focused on minimalism.

## Things I will accept issues or pull-requests for
- Bug fixes. If something doesn't do what it should, that's pretty important to 
the project goals
- Comment/documentation fixes. Same as above
- Readability/clarification suggestions in the code or comments. These are 
pretty subjective so I reserve the right to turn them down, but I'll consider 
them.

## Concepts

The fundamental concepts (of both CrowdX and MobX) are these:

**Observables** - An observable is some property of an object which has been 
tagged for observation by any **tracked functions** that access it.

**Tracked functions** - A tracked function is a pure function (no side-effects)
that accesses one or more observables. A tracked function is generally paired 
with another function which is not pure; its purpose is to produce a 
side-effect. The pair of these two is referred to as a "reaction". 
When observables are accessed in the course of the tracked function's execution - 
anywhere in its call tree - they get associated with the tracked function's 
corresponding side-effect function in a global mapping from observables -> 
reactions. Whenever the observable is modified, all of its associated reactions 
re-evaluate and produce their side-effects.

**Actions** - An action is a way of atomically bundling up multiple observable 
mutations. In other words, if you want to modify both a and b, but you only want
the app (tracked functions) to react once both of them have been updated, then
the function doing the mutating can be made into an action.

Technically the above is all you need; you can build everything else on top of 
these three concepts. However, one additional concept is included in CrowdX 
because it is so incredibly useful/common in practice, and is central to the 
CrowdX/MobX philosophy:

**Computed function** - A computed function is **both a tracked function and an 
observable**. It's a pure function that observes observables and derives from
them a value, creating no side-effects. However, internally, the most recent 
value it created is cached and only ever gets _pushed_ to recompute when one
of its constituents changes. This avoids the equality checks that so often
complicate partial-updating in apps. Finally- its cached value can itself be
tracked, allowing the construction of a graph of values dependent on other 
values, in which the graph is never stale, and at the same time only the pieces 
of it that actually need to update ever get updated.

## Architecture summary

When an object or array is made into an observable, it gets replaced by a 
Proxied version. This new object intercepts get and set calls on all of its 
properties: getters track the property for whatever tracked function may 
currently be running, and setters publish to any reactions the property has
become associated with.

Each proxied object maintains a hidden mapping from property keys to sets of 
reaction functions. When it publishes, all of its reactions are triggered.

When a tracked function begins running, global state is set to track all 
observable getters that are triggered up until it's finished. At the end, all of
these get subscribed to it.

A similar mechanism happens for actions: when an action starts, global state is
set which tracks all observable *setters* that are triggered up until it's 
finished. At the end, all reactions associated with any of these get triggered.

Finally: for the purpose of avoiding memory leaks, all reactions (including 
computed functions, which are reactions underneath) must be explicitly cleaned 
up. This is done by passing the handle returned by `reaction()` or `computed()`
to the `dispose()` function. This will deactivate the reaction and allow its
referenced values to be cleaned up when appropriate.