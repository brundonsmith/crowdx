# CrowdX: A tiny MobX-like reactivity library in less than 3k

I created this because I'm a huge fan of MobX, but the "magic" that goes into 
it - while simple at its heart - may not be clear to everybody, and can be a 
turn-off for some. So I wanted to create a minimal demonstration of the 
principles to rob them of their mystery, and hopefull make more people 
comfortable using this kind of paradigm.

Secondarily: this was a learning experience for me to more thoroughly 
test/explore my own understanding of MobX's concepts. I gained some clarity by 
stripping things down to their simplest possible form.

Tertiarily: it's... really small. MobX itself is no behemoth, but this appears 
to be roughly 1/5 its size. CrowdX also does a whole lot less, of course, but 
the core is there. So, if you want something really extremely tiny and you don't 
need a lot of features, you could possibly get some value out of using this for 
a real project.

For an example of how to use it, take a look at `example.html`. The example is
done with vanilla JS, but it should translate very directly to React or 
whichever unopinionated rendering library you'd like to use.

## Project goals (in order)
1. Be a good, thoroughly-commented demonstration of the principles behind MobX
2. Be a simple and minimal library: no bells and whistles, just the core 
mechanisms, smallest footprint possible (except when that conflicts with 
point #1)

## Non-goals
1. Have wide browser support - CrowdX uses Proxy, Set, Map, class syntax, and is 
even shipped as an ES module. It doesn't work on IE. It should work on 
recent-ish versions of major browsers. You could probably stretch support with
some combination of polyfills, babel, and webpack, but improving/maintaining
browser reach is not a project priority.
2. Be ergonomic - by this I mainly mean: MobX comes with lots of fancy utility 
functions, as well as things like decorator support, to maximize the elegance of
application code. That's great, I love those things, but they aren't what this
project is about and I don't plan on adding them.
3. Be maximally performant - I tried to be sane with performance, this library
shouldn't be *un*-performant, but readability is the top priority. Also, I 
suspect MobX has an insane amount of clever optimization going on behind the 
scenes from years of development, and I'm just not interested in spending much 
time on that or sacrificing the project's readability/educational value.

## Things I will accept issues or pull-requests for
- Bug fixes. If something doesn't do what it should, that's pretty important to 
the project goals
- Comment/documentation fixes. Same as above
- Readability suggestions in code or comments. These are pretty subjective so
I reserve the right to turn them down, but I'll consider them.
- Really egregious performance or usability problems. Again, subject to denial,
but if it's on the order of "makes this completely impossible to use for 
anything real" and/or "it would not complicate things at all to fix", I'm open 
to addressing them.