import React, { Component } from 'react';

import '../../components/general/common.scss'

import history from '../../components/general/history.js';
import generalStore from '../../components/general/store.js';
import generalActions from '../../components/general/actions.js';

class Navbar extends Component {
	constructor(props) {
		super(props);

	}

	render() {
		return (
			<section id='navbar'>
				<h1>Thermo-ReImager</h1>
			</section>
		);
	}
}

module.exports = Navbar;