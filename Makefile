default: test

test/b2g:
	node setup.js

.PHONY: test
test: test/b2g
	./node_modules/mocha/bin/mocha --ui tdd \
		test/install.js

.PHONY: ci
ci:
	Xvfb :99 &
	DISPLAY=:99 make test

