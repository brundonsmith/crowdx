
/**
 * This singleton holds all global state related to creating, maintaining, and
 * triggering subscriptions
 */
 class CrowdXTrackingStore {


    // These three properties are all of the state in this class

    /**
     * @type {Map<() => unknown, Set<Set<() => unknown>>>}
     */
    reactionSubscriptionSets = new Map();

    /**
     * @type {null | { trackedFunction: () => unknown, reactionSets: Set<Set<() => unknown>> }}
     */
    currentlyTracking = null;

    /**
     * @type {null | Set<Set<() => unknown>>}
     */
    currentActionReactionSets = null;


    /**
     * When a tracked function is being tracked, a reference to it is kept in 
     * currentlyTracking.trackedFunction and the observables it encounters are registered 
     * in currentlyTracking.reactionSets. When the function completes, the 
     * reaction is added to all found observables, and these pieces of state 
     * get cleared.
     * 
     * @param {() => unknown} func
     */
    beginTracking(func) {
        this.currentlyTracking = {
            trackedFunction: func,
            reactionSets: new Set()
        }

        if (!this.reactionSubscriptionSets.has(this.currentlyTracking.trackedFunction)) {
            this.reactionSubscriptionSets.set(this.currentlyTracking.trackedFunction, new Set());
        }
    }
    completeTracking() {
        if (this.currentlyTracking != null) {
            for (const reactionSet of this.currentlyTracking.reactionSets) {
                reactionSet.add(this.currentlyTracking.trackedFunction);
            }

            this.currentlyTracking = null;
        }
    }

    
    /**
     * Given an observable's reaction set, tracks it in the context of the 
     * currently-running tracked function, if any.
     * 
     * @param {Set<() => unknown>} reactionSet
     */
    track(reactionSet) {
        if (this.currentlyTracking != null) {
            this.currentlyTracking.reactionSets.add(reactionSet);
            this.reactionSubscriptionSets.get(this.currentlyTracking.trackedFunction)?.add(reactionSet);
        }
    }

    /**
     * When we're done with a reaction, this method can be used to remove it
     * from all subscription lists.
     * 
     * Beyond just stopping the reaction from continuing to trigger, this is 
     * important to do when you no longer want the reaction because it allows any 
     * memory being referenced by it to be cleaned up, preventing memory-leaks.
     * 
     * @param {() => unknown} reaction
     */
    dispose(reaction) {
        const reactionSets = this.reactionSubscriptionSets.get(reaction);

        if (reactionSets != null) {
            for (const reactionSet of reactionSets) {
                reactionSet.delete(reaction);
            }

            this.reactionSubscriptionSets.delete(reaction);
        }
    }


    /**
     * When an action begins, all publication of changes to observables is 
     * suspended and those observables are instead tracked in 
     * currentActionObservables. Once the action is complete, all of those 
     * observables finally publish at once, with a consistent app state.
     */
    beginAction() {
        this.currentActionReactionSets = new Set();
    }
    completeAction() {
        const observables = this.currentActionReactionSets;
        this.currentActionReactionSets = null;

        if (observables != null) {
            this.publishAll(observables);
        }
    }


    /**
     * Given the reaction set for an observable which was mutated, takes 
     * the appropriate course of action depending on whether or not we're 
     * currently inside an action.
     * 
     * @param {Set<() => unknown>} reactionSet
     */
    publish(reactionSet) {
        if (this.currentActionReactionSets != null) {
            // If we're in an action, set the reactions aside for later
            this.currentActionReactionSets.add(reactionSet);
        } else {
            // Else, go ahead and trigger them
            for (const reaction of reactionSet) {
                reaction();
            }
        }
    }

    
    /**
     * Same as publish(), but for multiple sets of reaction. De-dupes reactions
     * to avoid redundant calls.
     * 
     * @param {Set<Set<() => unknown>>} reactionSets
     */
    publishAll(reactionSets) {
        if (this.currentActionReactionSets != null) {
            // If we're in an action, set all reactions aside for later
            for (const reactionSet of reactionSets) {
                this.currentActionReactionSets.add(reactionSet);
            }
        } else {
            // Else, go ahead and trigger them
            const allReactions = new Set();

            // Reactions get combined into a single Set so that if there are 
            // duplicates (multiple observables trigger the same reaction), 
            // those only get run once.
            for (const reactionSet of reactionSets) {
                for (const reaction of reactionSet) {
                    allReactions.add(reaction);
                }
            }

            for (const reaction of allReactions) {
                reaction();
            }
        }
    }
}


/**
 * Singleton instance of CrowdXTrackingStore
 */
const subscriptionsStore = new CrowdXTrackingStore();


/**
 * Used to store/retrieve a hidden property on observable objects referring to
 * their parent observable's reaction set (if any). This is needed for cases 
 * where a change to the observable object doesn't affect any of its known 
 * (observed properties), but needs to let any parent know which might have 
 * iterated over its members.
 */
const PARENT_REACTIONS = Symbol("PARENT_REACTIONS");

/**
 * Used to store/retrieve a hidden property on observable objects referring to
 * the collection of reaction sets for each of its observable properties.
 * These are used for publication/subscription.
 */
const PROPERTY_REACTIONS = Symbol("OBSERVABLE_REACTIONS");

/**
 * Unlike objects, arrays have mutation methods that we need to handle correctly
 * for publishing. Each method in this list will be wrapped in a new function 
 * that causes the entire array to be published as a whole, not just one of its 
 * members.
 */
const ARRAY_MUTATION_METHODS = [ "push", "pop", "fill", "splice", "sort", 
"reverse", "shift", "unshift" ];

/**
 * This defines the JS Proxy behavior for our observable objects.
 */
const proxyHandler = {

    /**
     * We override the property getter so that if we're currently running a 
     * tracked function, the accessed property's reaction-set will get the 
     * ongoing function's reaction added to it for publication.
     * 
     * We also take this opportunity to swap certain methods on the Array object
     * for ones that will publish their mutations correctly 
     * (see ARRAY_MUTATION_METHODS).
     */
    get: function (target, prop) {
        if (Array.isArray(target) && ARRAY_MUTATION_METHODS.includes(prop)) {
            return function(...args) {
                const res = target[prop](...args);
                subscriptionsStore.publish(target[PARENT_REACTIONS]);
                return res;
            };
        } else {
            if (target[PROPERTY_REACTIONS].hasOwnProperty(prop)) {
                subscriptionsStore.track(target[PROPERTY_REACTIONS][prop]);
            }
    
            return target[prop];
        }
    },

    /**
     * We override the property setter to publish to the relevant observable 
     * when a new value is assigned to an observable property.
     * 
     * We also call observable() on the provided value, to make sure our entire
     * object tree remains observable all the way down.
     */
    set: function (target, prop, value) {

        // if the value didn't actually change, do 
        // nothing (importantly: don't publish)
        if (target[prop] !== value) {
            const newProperty = !target.hasOwnProperty(prop);
            
            // if there isn't already an observable reaction-set for this 
            // property, create one
            if (target[PROPERTY_REACTIONS][prop] == null) {
                target[PROPERTY_REACTIONS][prop] = new Set();
            }
    
            // assign the new value, wrapping it in an observable if needed
            target[prop] = observable(value, target[PROPERTY_REACTIONS][prop]);
    
            if (newProperty) {
                // if this is a new property, notify the parent that the 
                // "entire object" changed
                if (target[PARENT_REACTIONS] != null) {
                    subscriptionsStore.publish(target[PARENT_REACTIONS]);
                }
            } else {
                subscriptionsStore.publish(target[PROPERTY_REACTIONS][prop]);
            }
        }

        return true;
    },
};




// ------------- External API -------------

/**
 * Takes any JSON-like value and makes it observable. If it is not an object or 
 * array, or if it's already observable, this function does nothing. Otherwise, 
 * any changes to the properties/contents of val will be tracked by tracked 
 * functions. It will also recurse on all of val's children, and their children, 
 * etc.
 * 
 * NOTE: Because of the need for proxying, this function returns a new object,
 * it does not modify the one it's given.
 * 
 * parentReactionSet is an optional parameter for internal use by the library 
 * only. It is used to allow child objects/arrays to publish changes to their 
 * entire selves (as opposed to changes to one of their members).
 * 
 * @template T
 * @param {T} val
 * @param {Set<() => unknown>} [parentReactionSet]
 * @returns {T}
 */
export function observable(val, parentReactionSet) {
    if (typeof val === "object" && val != null && !Object.hasOwnProperty(PROPERTY_REACTIONS)) {
        const observableVal = Array.isArray(val) ? [] : {};

        // If this observable object is a member of an observable parent, make 
        // note of its observable symbol so that the child can publish its
        // entire self when appropriate
        if (parentReactionSet != null) {
            Object.defineProperty(observableVal, PARENT_REACTIONS, {
                value: parentReactionSet,
                writable: false,
                enumerable: false
            })
        }

        // Create a hidden property to store the reaction-sets for 
        // each of this object's observable properties
        Object.defineProperty(observableVal, PROPERTY_REACTIONS, {
            value: {},
            writable: false,
            enumerable: false
        });
        
        // Apply the proxy (see proxyHandler above)
        const proxy = new Proxy(observableVal, proxyHandler);

        // Copy the values from the original object into the new, proxied object
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                proxy.push(val[i]);
            }
        } else {
            for (const key of Object.keys(val)) {
                proxy[key] = val[key];
            }
        }

        return proxy;
    } else if(typeof val === "object" && val != null && !Object.hasOwnProperty(PARENT_REACTIONS)) {

        // If this object is already observable but is being moved to a new 
        // parent, update its parent reaction-set reference
        if (parentReactionSet != null) {
            Object.defineProperty(val, PARENT_REACTIONS, {
                value: parentReactionSet,
                writable: false,
                enumerable: false
            })
        }

        return val;
    } else {
        return val;
    }
}

/**
 * This is how you create a tracked function. trackedFn is said tracked 
 * function; it should be a pure function that references observables from its 
 * scope and returns a value. That value will then be passed to effectFn, which
 * can have whatever side-effects you want.
 * 
 * Any change to any observables referenced by trackedFn will trigger both 
 * functions to be re-evaluated. In practice, this means effectFn will have 
 * another effect on the world. This is the key useful mechanism of this 
 * library.
 * 
 * @template T
 * @param {() => T} trackedFn
 * @param {(result: T) => void} effectFn
 * @returns {DisposalHandle}
 */
export function reaction(trackedFn, effectFn) {
    const reactionFn = function() {
        subscriptionsStore.beginTracking(reactionFn);
        const result = trackedFn();
        subscriptionsStore.completeTracking();
        effectFn(result);
    }

    reactionFn();

    const disposalHandle = /** @type {DisposalHandle} */ ({});

    Object.defineProperty(disposalHandle, REACTION_FOR_DISPOSAL, {
        value: reactionFn,
        writable: false,
        enumerable: false
    });

    // We return the reaction so it can be cleaned up later by calling dispose()
    return disposalHandle;
}

const REACTION_FOR_DISPOSAL = Symbol("REACTION_FOR_DISPOSAL");

/**
 * @typedef {{ [REACTION_FOR_DISPOSAL]: () => void }} DisposalHandle
 */

/**
 * An action is a function that mutates observables, but doesn't publish on 
 * intermediate states; it waits until the entire action has completed before
 * publishing. The two main benefits of this are:
 * 
 * 1) Consistency/atomicity. No partially-updated states will make it 
 * downstream to tracked functions.
 * 
 * 2) Performance. Changing multiple properties in sequence won't cause extra 
 * work to be done and then immediately discarded.
 * 
 * @template {(...params: any[]) => void} F
 * @param {F} fn
 * @returns {F}
 */
export function action(fn) {
    return /** @type F */ (function(...args) {
        subscriptionsStore.beginAction();
        fn(...args);
        subscriptionsStore.completeAction();
    })
}

/**
 * A computed is a pure function that references observables (including other 
 * computed functions), and returns a value. Where this becomes valuable is the
 * fact that a computed function is both a tracked function and an observable
 * (which can be tracked by other tracked functions). So you can have computed 
 * functions that reference other computed functions, and each of those computed 
 * values will only be re-computed when one of its constituents changes. You
 * end up with a graph of derived values where, when a base observable changes,
 * only the parts of the graph that actually need to be re-computed get 
 * recomputed. This is where this paradigm really gets powerful.
 * 
 * @template T
 * @param {() => T} fn
 * @returns {() => T | undefined}
 */
export function computed(fn) {
    
    /**
     * We store the most recently-computed value in an observable in scope
     * 
     * @type {{ value: T|undefined }}
     */
    const cache = observable({ value: undefined });
    
    // We eagerly set up our reaction, computing the initial cache value 
    // immediately by calling fn()
    const reactionHandle = reaction(
        fn,
        val => cache.value = val);
    const reactionFn = reactionHandle[REACTION_FOR_DISPOSAL];


    const computedFn = function() {
        
        // When the computed function is called all we do is access the cache. 
        // But since the cache is observable, recipients will receive "push" 
        // updates whenever fn() is recomputed.
        return cache.value;
    };

    // The returned function secretly stores its reaction function for the 
    // purpose of cleaning it up across all observables later (yes, you can put 
    // properties on functions in JavaScript!). See SubscriptionsStore.dispose() 
    // for more details.
    Object.defineProperty(computedFn, REACTION_FOR_DISPOSAL, {
        value: reactionFn,
        writable: false,
        enumerable: false
    });

    return computedFn;
}

/**
 * Values returned from reaction() and computed() can be passed to this 
 * function to "dispose" the relevant reaction.
 * 
 * Beyond just stopping the reaction from continuing to trigger, this is 
 * important to do when you no longer want the reaction because it allows any 
 * memory being referenced by it to be cleaned up, preventing memory-leaks.
 * 
 * @param {DisposalHandle} disposalHandle
 */
export function dispose(disposalHandle) {
    if (disposalHandle[REACTION_FOR_DISPOSAL] != null) {
        subscriptionsStore.dispose(disposalHandle[REACTION_FOR_DISPOSAL]);
    }
}