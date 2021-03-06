/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint require-jsdoc: "off" */

let expect = require('chai').expect;
let actors = require('../index');
let P = require('bluebird');

let testSystem;

describe('ActorSystem', function() {
  afterEach(function() {
    if (testSystem) {
      return testSystem.destroy();
    }
  });

  it('should destroy all actors and call proper hooks upon destruction', P.coroutine(function*() {
    let hookList = [];

    class MyResource {
      getResource() {
        return 'MyResource value';
      }

      destroy() {
        hookList.push('resource');
      }
    }

    class RootActor {
      static inject() {
        return ['MyResource'];
      }

      destroy() {
        hookList.push('root');
      }
    }

    testSystem = actors({
      resources: [MyResource],
      root: RootActor,
      test: true
    });

    let rootActor = yield testSystem.rootActor();

    yield rootActor.createChild({
      initialize: function(selfActor) {
        return selfActor.createChild({
          destroy: () => hookList.push('grandchild')
        });
      },

      destroy: () => hookList.push('child')
    });

    yield testSystem.destroy();

    expect(hookList).to.be.deep.equal(['grandchild', 'child', 'root', 'resource']);
  }));

  describe('Custom logger', function() {
    it('should support custom loggers', P.coroutine(function*() {
      let loggerMessages = {
        error: [],
        warn: [],
        info: [],
        debug: []
      };

      class MyLogger {
        error(...msg) {
          loggerMessages.error.push(msg);
        }

        warn(...msg) {
          loggerMessages.warn.push(msg);
        }

        info(...msg) {
          loggerMessages.info.push(msg);
        }

        debug(...msg) {
          loggerMessages.debug.push(msg);
        }
      }

      class MyActor {
        initialize(selfActor) {
          this.log = selfActor.getLog();
        }

        test(msg) {
          this.log.info(msg);
        }
      }

      testSystem = actors({
        test: true,
        root: MyActor,
        logger: MyLogger,
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      yield testSystem.rootActor().then(actor => actor.sendAndReceive('test', 'Hello!'));

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    }));

    it('should reject custom loggers with improper interface', () => {
      class MyImproperLogger {
        test(...msg) {
          console.log('Test');
        }
      }

      class MyActor {
        initialize(selfActor) {
          this.log = selfActor.getLog();
        }

        test(msg) {
          this.log.info(msg);
        }
      }

      let error;

      try {
        testSystem = actors({
          test: true,
          root: MyActor,
          logger: MyImproperLogger,
          loggerConfig: {
            categories: {
              default: 'Silent',
              MyActor: 'Info'
            }
          }
        });
      }
      catch (err) {
        error = err;
      }

      expect(error).to.be.an.instanceOf(Error);
    });

    it('should support custom loggers specified by module path', P.coroutine(function*() {
      class MyActor {
        initialize(selfActor) {
          this.log = selfActor.getLog();
        }

        test(msg) {
          this.log.info(msg);
        }
      }

      testSystem = actors({
        test: true,
        root: MyActor,
        logger: '/test-resources/test-logger',
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      yield testSystem.rootActor().then(actor => actor.sendAndReceive('test', 'Hello!'));

      let loggerMessages = testSystem.getLog().getImplementation().getLoggerMessages();

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    }));

    it('should be able to pass custom logger across process boundary', P.coroutine(function*() {
      class MyActor {
        initialize(selfActor) {
          this.log = selfActor.getLog();
        }

        test(msg) {
          this.log.info(msg);
        }

        getLoggerMessages() {
          return this.log.getImplementation().getLoggerMessages();
        }
      }

      testSystem = actors({
        test: true,
        logger: '/test-resources/test-logger',
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      let rootActor = yield testSystem.rootActor();
      let childActor = yield rootActor.createChild(MyActor, { mode: 'forked' });

      yield childActor.sendAndReceive('test', 'Hello!');

      let loggerMessages = yield childActor.sendAndReceive('getLoggerMessages');

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    }));
  });
});