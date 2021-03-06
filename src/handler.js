import {
    Binding, $handle, $provide, $lookup,
    $unhandled
} from "./definition";

import { handle } from "./define";

import {
    Lookup, Deferred, Resolution, Composition,
    RejectedError, TimeoutError
} from "./callback"; 
         
import {
    Base, Variance, $isNothing, $isFunction,
    $isString, $isPromise, $classOf, $flatten,
    $decorator, $decorate
} from "miruken-core";

/**
 * Base class for handling arbitrary callbacks.
 * @class Handler
 * @constructor
 * @param  {Object}  [delegate]  -  delegate
 * @extends Base
 */
export const Handler = Base.extend({
    constructor(delegate) {
        /**
         * Gets the delegate.
         * @property {Object} delegate
         * @readOnly
         */            
        Object.defineProperty(this, "delegate", {
            value:    delegate,
            writable: false
        });
    },
    /**
     * Handles the callback.
     * @method handle
     * @param   {Object}          callback        -  any callback
     * @param   {boolean}         [greedy=false]  -  true if handle greedily
     * @param   {Handler} [composer]      -  composition handler
     * @returns {boolean} true if the callback was handled, false otherwise.
     */
    handle(callback, greedy, composer) {
        if ($isNothing(callback)) {
            return false;
        }
        if ($isNothing(composer)) {
            composer = compositionScope(this);
        }
        return !!this.handleCallback(callback, !!greedy, composer);
    },
    /**
     * Handles the callback with all arguments populated.
     * @method handleCallback
     * @param   {Object}   callback    -  any callback
     * @param   {boolean}  greedy      -  true if handle greedily
     * @param   {Handler}  [composer]  -  composition handler
     * @returns {boolean} true if the callback was handled, false otherwise.
     */
    handleCallback(callback, greedy, composer) {
        return $handle.dispatch(this, callback, null, composer, greedy) !== $unhandled;
    },
    @handle(Lookup)
    __lookup(lookup, composer) {
        return $lookup.dispatch(this, lookup,lookup.key, composer, lookup.isMany, lookup.addResult);        
    },
    @handle(Deferred)
    __defered(deferred, composer) {
        return $handle.dispatch(this, deferred.callback, null, composer, deferred.isMany, deferred.track);        
    },
    @handle(Resolution)
    __resolution(resolution, composer) {
        const key      = resolution.key,
              many     = resolution.isMany;
        let   resolved = $provide.dispatch(this, resolution, key, composer, many, resolution.resolve);
        if (resolved === $unhandled) { // check if delegate or handler implicitly satisfy key
            const implied  = new Binding(key),
                  delegate = this.delegate;
            if (delegate && implied.match($classOf(delegate), Variance.Contravariant)) {
                resolved = resolution.resolve(delegate, composer);
                if (resolved === false) {
                    resolved = $unhandled;
                }
            }
            if ((resolved === $unhandled || many) &&
                implied.match($classOf(this), Variance.Contravariant)) {
                resolved = resolution.resolve(this, composer);
                if (resolved === false) {
                    resolved = $unhandled;
                }
            }
        }
        if (resolved === $unhandled) {
            return $unhandled;
        }
    },
    @handle(Composition)
    __composition(composable, composer) {
        const callback = composable.callback;
        if ($isNothing(callback)) { return $unhandled; }
        return $handle.dispatch(this, callback, null, composer);
    }
}, {
    coerce(object) { return new this(object); }
});

Base.implement({
    toHandler() { return Handler(this); }
});

const compositionScope = $decorator({
    handleCallback(callback, greedy, composer) {
        if (callback.constructor !== Composition) {
            callback = new Composition(callback);
        }
        return this.base(callback, greedy, composer);
    }
});

/**
 * Represents a two-way
 * {{#crossLink "Handler"}}{{/crossLink}} path.
 * @class CascadeHandler
 * @constructor
 * @param  {Handler}  handler           -  primary handler
 * @param  {Handler}  cascadeToHandler  -  secondary handler
 * @extends Handler
 */
export const CascadeHandler = Handler.extend({
    constructor(handler, cascadeToHandler) {
        if ($isNothing(handler)) {
            throw new TypeError("No handler specified.");
        } else if ($isNothing(cascadeToHandler)) {
            throw new TypeError("No cascadeToHandler specified.");
        }
        Object.defineProperties(this, {
            /**
             * Gets the primary handler.
             * @property {Handler} handler
             * @readOnly
             */
            handler:  {
                value:     handler.toHandler(),
                writable: false
            },
            /**
             * Gets the secondary handler.
             * @property {Handler} cascadeToHandler
             * @readOnly
             */            
            cascadeToHandler: {
                value:    cascadeToHandler.toHandler(),
                writable: false
            }
        });
    },
    handleCallback(callback, greedy, composer) {
        let handled = this.base(callback, greedy, composer);
        return !!(greedy
            ? handled | (this.handler.handleCallback(callback, true, composer)
               | this.cascadeToHandler.handleCallback(callback, true, composer))
            : handled || (this.handler.handleCallback(callback, false, composer)
               || this.cascadeToHandler.handleCallback(callback, false, composer)));
    }
});

/**
 * Encapsulates zero or more
 * {{#crossLink "Handler"}}{{/crossLink}}.<br/>
 * See [Composite Pattern](http://en.wikipedia.org/wiki/Composite_pattern)
 * @class CompositeHandler
 * @constructor
 * @param  {Arguments}  arguments  -  callback handlers
 * @extends Handler
 */
export const CompositeHandler = Handler.extend({
    constructor(...handlers) {
        let _handlers = [];
        this.extend({
            /**
             * Gets all participating callback handlers.
             * @method getHandlers
             * @returns {Array} participating callback handlers.
             */
            getHandlers() { return _handlers.slice(); },
            /**
             * Adds the callback handlers to the composite.
             * @method addHandlers
             * @param   {Any}  ...handlers  -  handlers to add
             * @returns {CompositeHandler}  composite
             * @chainable
             */
            addHandlers(...handlers) {
                handlers = $flatten(handlers, true).map(h => h.toHandler());
                _handlers.push(...handlers);
                return this;
            },
            /**
             * Adds the callback handlers to the composite.
             * @method addHandlers
             * @param   {number}  atIndex      -  index to insert at
             * @param   {Any}     ...handlers  -  handlers to insert
             * @returns {CompositeHandler}  composite
             * @chainable
             */
            insertHandlers(atIndex, ...handlers) {
                handlers = $flatten(handlers, true).map(h => h.toHandler());
                _handlers.splice(atIndex, 0, ...handlers);                
                return this;                    
            },                
            /**
             * Removes callback handlers from the composite.
             * @method removeHandlers
             * @param   {Any}  ...handlers  -  handlers to remove
             * @returns {CompositeHandler}  composite
             * @chainable
             */
            removeHandlers(...handlers) {
                $flatten(handlers).forEach(handler => {
                    if (!handler) {
                        return;
                    }
                    const count = _handlers.length;
                    for (let idx = 0; idx < count; ++idx) {
                        const testHandler = _handlers[idx];
                        if (testHandler == handler || testHandler.delegate == handler) {
                            _handlers.splice(idx, 1);
                            return;
                        }
                    }
                });
                return this;
            },
            handleCallback(callback, greedy, composer) {
                let handled = this.base(callback, greedy, composer);
                if (handled && !greedy) { return true; }
                let count   = _handlers.length;
                for (let idx = 0; idx < count; ++idx) {
                    const handler = _handlers[idx];
                    if (handler.handleCallback(callback, greedy, composer)) {
                        if (!greedy) { return true; }
                        handled = true;
                    }
                }
                return handled;
            }
        });
        this.addHandlers(handlers);
    }
});

/**
 * Shortcut for handling a callback.
 * @method
 * @static
 * @param   {Function}  handler     -  handles callbacks
 * @param   {Any}       constraint  -  callback constraint
 * @returns {Handler} callback handler.
 * @for Handler
 */
Handler.accepting = function (handler, constraint) {
    const accepting = new Handler();
    $handle(accepting, constraint, handler);
    return accepting;
};

/**
 * Shortcut for providing a callback.
 * @method
 * @static
 * @param  {Function}  provider    -  provides callbacks
 * @param  {Any}       constraint  -  callback constraint
 * @returns {Handler} callback provider.
 * @for Handler
 */
Handler.providing = function (provider, constraint) {
    const providing = new Handler();
    $provide(providing, constraint, provider);
    return providing;
};

/**
 * Register the policy to be applied by a Handler.
 * @method registerPolicy
 * @static
 * @param   {Function}        policyType  -  type of policy
 * @param   {string|symbol}   key         -  policy key  
 * @returns {boolean} true if successful, false otherwise.
 * @for Handler
 */ 
Handler.registerPolicy = function (policyType, key) {
    if (Handler.prototype.hasOwnProperty(key)) {
        return false;
    }
    Handler.implement({
        [key](policy) {
            return policy ? this.decorate({
                @handle(policyType)
                mergePolicy(receiver) {
                    policy.mergeInto(receiver)                
                }
            }) : this;
        }
    });
    return true;
}

Handler.implement({
    /**
     * Asynchronusly handles the callback.
     * @method defer
     * @param   {Object}  callback  -  callback
     * @returns {Promise} promise to handled callback.
     * @for Handler
     * @async
     */                        
    defer(callback) {
        const deferred = new Deferred(callback);
        this.handle(deferred, false);
        return deferred.callbackResult;            
    },
    /**
     * Asynchronusly handles the callback greedily.
     * @method deferAll
     * @param   {Object}  callback  -  callback
     * @returns {Promise} promise to handled callback.
     * @for Handler
     * @async
     */                                
    deferAll(callback) {
        const deferred = new Deferred(callback, true);
        this.handle(deferred, true);
        return deferred.callbackResult;
    },
    /**
     * Resolves the key.
     * @method resolve
     * @param   {Any}  key  -  key
     * @returns {Any}  resolved key.  Could be a promise.
     * @for Handler
     * @async
     */                                
    resolve(key) {
        const resolution = (key instanceof Resolution) ? key : new Resolution(key);
        if (this.handle(resolution, false)) {
            return resolution.callbackResult;
        }
    },
    /**
     * Resolves the key greedily.
     * @method resolveAll
     * @param   {Any}   key  -  key
     * @returns {Array} resolved key.  Could be a promise.
     * @for Handler
     * @async
     */                                        
    resolveAll(key) {
        const resolution = (key instanceof Resolution) ? key : new Resolution(key, true);
        return this.handle(resolution, true) ? resolution.callbackResult : [];
    },
    /**
     * Looks up the key.
     * @method lookup
     * @param   {Any}  key  -  key
     * @returns {Any}  value of key.
     * @for Handler
     */                                        
    lookup(key) {
        const lookup = (key instanceof Lookup) ? key : new Lookup(key);
        if (this.handle(lookup, false)) {
            return lookup.callbackResult;
        }
    },
    /**
     * Looks up the key greedily.
     * @method lookupAll
     * @param   {Any}  key  -  key
     * @returns {Array}  value(s) of key.
     * @for Handler
     */                                                
    lookupAll(key) {
        const lookup = (key instanceof Lookup) ? key : new Lookup(key, true);
        return this.handle(lookup, true)
            ? lookup.callbackResult
            : [];
    },
    /**
     * Decorates the handler.
     * @method decorate
     * @param   {Object}  decorations  -  decorations
     * @returns {Handler} decorated callback handler.
     * @for Handler
     */        
    decorate(decorations) {
        return $decorate(this, decorations);
    },
    /**
     * Decorates the handler for filtering callbacks.
     * @method filter
     * @param   {Function}  filter     -  filter
     * @param   {boolean}   reentrant  -  true if reentrant, false otherwise
     * @returns {Handler} filtered callback handler.
     * @for Handler
     */                                                        
    filter(filter, reentrant) {
        if (!$isFunction(filter)) {
            throw new TypeError(`Invalid filter: ${filter} is not a function.`);
        }
        return this.decorate({
            handleCallback(callback, greedy, composer) {
                if (!reentrant && (callback instanceof Composition)) {
                    return this.base(callback, greedy, composer);
                }
                const base = this.base;
                return filter(callback, composer, () =>
                    base.call(this, callback, greedy, composer));
            }
        });
    },
    /**
     * Decorates the handler for applying aspects to callbacks.
     * @method aspect
     * @param   {Function}  before     -  before action.  Return false to reject
     * @param   {Function}  action     -  after action
     * @param   {boolean}   reentrant  -  true if reentrant, false otherwise
     * @returns {Handler}  callback handler aspect.
     * @throws  {RejectedError} An error if before returns an unaccepted promise.
     * @for Handler
     */
    aspect(before, after, reentrant) {
        return this.filter((callback, composer, proceed) => {
            if ($isFunction(before)) {
                const test = before(callback, composer);
                if ($isPromise(test)) {
                    const hasResult = "callbackResult" in callback,
                          accept    = test.then(accepted => {
                            if (accepted !== false) {
                                aspectProceed(callback, composer, proceed, after, accepted);
                                return hasResult ? callback.callbackResult : true;
                            }
                            return Promise.reject(new RejectedError(callback));
                        });
                    if (hasResult) {
                        callback.callbackResult = accept;                            
                    }
                    return true;
                } else if (test === false) {
                    throw new RejectedError(callback);
                }
            }
            return aspectProceed(callback, composer, proceed, after);
        }, reentrant);
    },
    /**
     * Decorates the handler to provide one or more values.
     * @method $provide
     * @param   {Array}  ...values  -  values to provide
     * @returns {Handler}  decorated callback handler.
     * @for Handler
     */
    $provide(...values) {
        values = $flatten(values, true);
        if (values.length > 0) {
            const provider = this.decorate();
            values.forEach(value => $provide(provider, value));
            return provider;
        }
        return this;
    },
    /**
     * Decorates the handler to conditionally handle callbacks.
     * @method when
     * @param   {Any}  constraint  -  matching constraint
     * @returns {Handler}  conditional callback handler.
     * @for Handler
     */                                                                        
    when(constraint) {
        const when = new Binding(constraint),
            condition = callback => {
                if (callback instanceof Deferred) {
                    return when.match($classOf(callback.callback), Variance.Contravariant);
                } else if (callback instanceof Resolution) {
                    return when.match(callback.key, Variance.Covariant);
                } else {
                    return when.match($classOf(callback), Variance.Contravariant);
                }
            };
        return this.decorate({
            handleCallback(callback, greedy, composer) {
                return condition(callback) && this.base(callback, greedy, composer);
            }
        });
    },
    /**
     * Builds a handler chain.
     * @method next
     * @param   {Arguments}  arguments  -  handler chain members
     * @returns {Handler}  chaining callback handler.
     * @for Handler
     */                                                                                
    next(...handlers) {
        switch(handlers.length) {
        case 0:  return this;
        case 1:  return new CascadeHandler(this, handlers[0])
        default: return new CompositeHandler(this, ...handlers);
        }
    },
    /**
     * Prevents continuous or concurrent handling on a target.
     * @method $guard
     * @param   {Object}  target              -  target to guard
     * @param   {string}  [property='guard']  -  property for guard state
     * @returns {Handler}  guarding callback handler.
     * @for Handler
     */        
    $guard(target, property) {
        if (target) {
            let guarded = false;
            property = property || "guarded";
            const propExists = property in target;
            return this.aspect(() => {
                if ((guarded = target[property])) {
                    return false;
                }
                target[property] = true;
                return true;
            }, () => {
                if (!guarded) {
                    target[property] = undefined;
                    if (!propExists) {
                        delete target[property];
                    }
                }
            });
        }
        return this;
    },
    /**
     * Tracks the activity counts associated with a target. 
     * @method $activity
     * @param   {Object}  target                 -  target to track
     * @param   {Object}  [ms=50]                -  delay to wait before tracking
     * @param   {string}  [property='activity']  -  property for activity state
     * @returns {Handler}  activity callback handler.
     * @for Handler
     */                
    $activity(target, ms, property) {
        property = property || "$$activity";
        const propExists = property in target;            
        return this.aspect(() => {
            const state = { enabled: false };
            setTimeout(() => {
                if ("enabled" in state) {
                    state.enabled = true;
                    let activity = target[property] || 0;
                    target[property] = ++activity;
                }
            }, $isSomething(ms) ? ms : 50);
            return state;
        }, (_, composer, state) => {
            if (state.enabled) {
                let activity = target[property];
                if (!activity || activity === 1) {
                    target[property] = undefined;
                    if (!propExists) {
                        delete target[property];
                    }
                } else {
                    target[property] = --activity;
                }
            }
            delete state.enabled;
        });
    },
    /**
     * Ensures all return values are promises..
     * @method $promises
     * @returns {Handler}  promising callback handler.
     * @for Handler
     */                
    $promise() {
        return this.filter((callback, composer, proceed) => {
            try {                
                const handled = proceed();
                if (handled) {
                    const result = callback.callbackResult;                    
                    callback.callbackResult = $isPromise(result)
                        ? result : Promise.resolve(result);
                }
                return handled;
            } catch (ex) {
                callback.callbackResult = Promise.reject(ex);
                return true;
            }
        });
    },        
    /**
     * Configures the receiver to set timeouts on all promises.
     * @method $timeout
     * @param   {number}            ms       -  duration before promise times out
     * @param   {Function | Error}  [error]  -  error instance or custom error class
     * @returns {Handler}  timeout callback handler.
     * @for Handler
     */        
    $timeout(ms, error) {
        return this.filter((callback, composer, proceed) => {
            const handled = proceed();
            if (handled) {
                const result = callback.callbackResult;
                if ($isPromise(result)) {
                    callback.callbackResult = new Promise(function (resolve, reject) {
                        let timeout;
                        result.then(res => {
                            if (timeout) {
                                clearTimeout(timeout);
                            }
                            resolve(res);
                        }, err => {
                            if (timeout) {
                                clearTimeout(timeout);
                            }
                            reject(err);                                
                        });
                        timeout = setTimeout(function () {
                            if (!error) {
                                error = new TimeoutError(callback);
                            } else if ($isFunction(error)) {
                                error = Reflect.construct(error, [callback]);
                            }
                            if ($isFunction(result.reject)) {
                                result.reject(error);  // TODO: cancel
                            }
                            reject(error);
                        }, ms);
                    });
                }
            }
            return handled;
        });
    },
});

function aspectProceed(callback, composer, proceed, after, state) {
    let promise;
    try {
        const handled = proceed();
        if (handled) {
            const result = callback.callbackResult;
            if ($isPromise(result)) {
                promise = result;
                // Use 'fulfilled' or 'rejected' handlers instead of 'finally' to ensure
                // aspect boundary is consistent with synchronous invocations and avoid
                // reentrancy issues.
                if ($isFunction(after)) {
                    promise.then(result => after(callback, composer, state))
                           .catch(error => after(callback, composer, state));
                }
            }
        }
        return handled;
    } finally {
        if (!promise && $isFunction(after)) {
            after(callback, composer, state);
        }
    }
}
