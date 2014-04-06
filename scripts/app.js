
// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
	var rest = this.slice((to || from) + 1 || this.length);
	this.length = from < 0 ? this.length + from : from;
	return this.push.apply(this, rest);
};

angular.module('rsvp', ['ui.bootstrap', 'ui.router'])

	.config([ '$urlRouterProvider', '$stateProvider', function($urlRouterProvider, $stateProvider) {

		$urlRouterProvider.otherwise('/');

		$stateProvider
			.state('activation', {
				url: '/',
				controller: 'ActivationCtrl',
				templateUrl: 'views/activation.html'
			})

			.state('attendance', {
				url: '/attending/:activation_code',
				controller: 'AttendanceCtrl',
				templateUrl: 'views/attending.html'
			})

			.state('last-step', {
				url: '/last-step/:attending',
				controller: 'LastStepCtrl',
				templateUrl: 'views/last-step.html'
			})

			.state('rsvp', {
				url: '/rsvp/:activation_code',
				controller: 'RsvpCtrl',
				templateUrl: 'views/rsvp.html'
			})
	}])

	.run(['$rootScope', '$state', 'db', function($rootScope, $state, db) {

		$rootScope.rsvp = {
			group: null,
			activation_code: ''
		};

		$rootScope.errorMessage = null;
		$rootScope.showReset = false;

		$rootScope.showError = function(error) {
			$rootScope.errorMessage = error;
		}

		$rootScope.resetErrors = function() {
			$rootScope.errorMessage = null;
		}

		$rootScope.requestFailed = function() {
			$rootScope.showError('Oops! Something went wrong. Please try again later');
		}

		$rootScope.setGuestGroup = function(activation_code, callback) {

			db.GuestGroup.find(activation_code).then(function(r) {

				$rootScope.rsvp.group = r;

				//hack
				if (r.parent && r.parent.wedding_id != WEDDING_ID) {
					r.valid = false;
				}

				if (typeof callback == 'function') {
					callback(r);
				}

			}, function(r) {
				$rootScope.requestFailed(r);
			});
		}

		$rootScope.reset = function() {
			$rootScope.group = null;
			$rootScope.showReset = false;

			$rootScope.rsvp = {
				group: null,
				activation_code: ''
			};

			$state.go('activation');
		}
	}])

	.controller('ActivationCtrl', ['$scope', '$state', '$rootScope', 'db', function($scope, $state, $rootScope, db) {

		$scope.buttonText = 'RSVP';

		var groupCallback = function(r) {
			if (r.valid === false) {
				$scope.showError('The code "' + $scope.rsvp.activation_code + '" is invalid.');
				return false;
			}else {
				$state.go('attendance', {activation_code: $scope.rsvp.activation_code});
			}
		}

		$scope.submitCode = function() {

			if ($scope.rsvp.activation_code.length < 4) {
				$scope.showError('Acivation code must be at least 4 characters in length.');
				return false;
			}

			$scope.setGuestGroup($scope.rsvp.activation_code, groupCallback)
		}
	}])

	.controller('AttendanceCtrl', ['$scope', '$state', 'db', function($scope, $state, db) {

		if (!$scope.rsvp.group && typeof $state.params.activation_code !== 'undefined') {
			$scope.setGuestGroup($state.params.activation_code);
		}

		$scope.setAttendance = function(attending) {

			if (attending === 'yes') {
				$scope.rsvp.group.guests[0].is_attending = true;
				$state.go('rsvp', {activation_code: $state.params.activation_code});
				return;
			}

			var parent = $scope.rsvp.group.parent;
			parent.is_attending = false;
			parent.actual_count = 0;
			parent.rsvp_through_site = true;

			parent.save().then(function(r) {
				$state.go('last-step', {activation_code: $scope.rsvp.activation_code});

			}, function(r) {
				$scope.requestFailed(r);
			});
		}
	}])

	.controller('RsvpCtrl', ['$scope', '$state', '$rootScope', 'db', function($scope, $state, $rootScope, db) {

		$scope.addGuest = false;
		$scope.showShuttle = false;
		$scope.newGuest = new db.Guest;
		$scope.shuttleOpts = [];

		var setShuttleOpts = function(numGuests) {

			if (typeof SHUTTLE_CONFIRMATION !== 'undefined') {
				var opts = [];
				$scope.showShuttle = true;
				$scope.shuttleLink = SHUTTLE_LINK;

				for (var i = 1, len = numGuests; i <= len; i++) {
					opts.push(i);
				}

				$scope.shuttleOpts = opts;
			}
		}

		setShuttleOpts();

		if (!$scope.rsvp.group
			&& typeof $state.params.activation_code !== 'undefined') {

			$scope.setGuestGroup($state.params.activation_code, function(group) {
				setShuttleOpts(group.guests.length);
			});

			$scope.$watch('rsvp.group', function(newVal, oldVal) {
				if (!newVal) {
					return;
				}

				$scope.rsvp.group.guests[0].is_attending = true;
			});
		}

		$scope.doRsvp = function() {
			$scope.rsvp.group.save().then(function(r) {
				$rootScope.errorMessage = null; //reset error message
				$state.go('last-step', {attending: true});
			}, function(r) {
				$scope.requestFailed(r);
			});
		};

		$scope.saveGuest = function() {

			$scope.newGuest.is_new = true;
			$scope.newGuest.parent_id = $scope.rsvp.group.parent.id;
			$scope.newGuest.wedding_id = $scope.rsvp.group.parent.wedding_id;
			$scope.newGuest.active = true;

			$scope.newGuest.save().then(function(r) {
				r.is_attending = true;
				$scope.rsvp.group.guests.push(r);
				setShuttleOpts($scope.rsvp.group.guests.length);
				$scope.addGuest = false;
			}, function(r) {
				$scope.requestFailed(r);
			})
		};

		$scope.removeGuest = function(guest, index) {

			guest.active = false;

			guest.save().then(function(r) {
				$scope.rsvp.group.guests.remove(index);
			}, function(r) {
				$scope.requestFailed(r);
			});

			return false;
		};
	}])

	.controller('LastStepCtrl', ['$scope', '$state', '$rootScope', 'db',
		function($scope, $state, $rootScope, db) {

		$rootScope.showReset = true;
		$scope.header = 'We\'ll Miss You';
		$scope.message = 'Feel free to come back and re-RSVP if your plans change.';

		if ($state.params.attending) {
			$scope.header = 'See You There!';
			$scope.message = 'Make sure to check back on this site for wedding updates.';
		}
	}])

	.factory('db', function($q, $http) {

		dabl.Deferred = function () {
			var def = $q.defer(),
				promise = def.promise;

			def.promise = function() {
				return promise;
			};
			return def;
		};

		var adapter = new dabl.AngularRESTAdapter(API_URL, $http),
			Model = dabl.Model,
			db = {};

		db.Guest = Model.extend('guest', {
			adapter: adapter,
			url: 'guests/:id.json',
			fields: {
				id: {type: 'int', key: true},
				parent_id: 'int',
				address_id: 'int',
				wedding_id: 'int',
				first_name: String,
				last_name: String,
				activation_code: String,
				exptected_count: 'int',
				is_attending: Boolean,
				actual_count: 'int',
				rsvp_through_site: Boolean,
				is_new: Boolean,
				active: Boolean,
				created: 'int',
				updated: 'int'
			},
			prototype: {}
		})

		db.GuestGroup = Model.extend('guest-group', {
			adapter: adapter,
			url: 'guest-groups/:activation_code.json',
			fields: {
				activation_code: { type: String, key: true },
				wedding_id: 'int',
				guests: {type: Array, elementType: db.Guest},
				parent: db.Guest,
				valid: Boolean,
				shuttle_count: 'int'
			},
			prototype: {
				validate: function() {
					if (this.activation_code && this.activation_code.length < 4
						|| !this.activation_code) {
						this._validationErrors.push('The activattion code must be 4 characters.');
					}

					return this._validationErrors.length == 0;
				}
			}
		});

		return db;
	});
