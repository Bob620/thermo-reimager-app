import { Store } from 'bakadux';

import constants from '../../../constants.json';

module.exports = new Store('settings', {
	scalePosition: constants.settings.scalePositions.LOWERCENTER,
	scaleColor: constants.settings.colors.AUTO,
	belowColor: constants.settings.colors.AUTO,
	pointColor: constants.settings.colors.RED,
	pointType: constants.settings.pointTypes.THERMOLIKE,
	autoPointFontSize: true,
	pointFontSize: 0,
	autoBackgroundOpacity: true,
	backgroundOpacity: 0,
	scaleSize: 0,
	autoScale: true,
	scaleBarHeight: 0,
	autoHeight: true,
	scaleBarPosition: constants.settings.scaleBarPositions.ABOVE,
	pixelSizeConstant: 0,
	autoPixelSizeConstant: true,
	layerOrder: [constants.settings.BASELAYER],
	layerColors: {'al': {
		RGBA: 'rgba(255, 0, 0, 1)',
		R: 255,
		G: 0,
		B: 0,
		opacity: 1
	}},
	layers: [],
	activePoints: [],
	activeLayers: [constants.settings.BASELAYER]
});