const EventEmitter = require('events');

const { net } = require('electron');

const [, channel] = require('../../package.json').version.split('-');
const constants = require('../../constants.json');

function lookForUpdate() {
	return new Promise((resolve, reject) => {
		const req = net.request(`${constants.UPDATEURL}/channels/${channel}/latest`);

		req.on('error', err => {
			reject(err);
		});

		req.on('abort', () => {
			reject('Update lookup Aborted');
		});

		req.on('response', res => {
			if (res.statusCode === 200) {
				let data = '';

				res.on('data', chunk => {
					data = data + chunk;
				});

				res.on('end', () => {
					resolve(JSON.parse(data));
				});
			} else
				reject(res.statusCode);
		});
		req.end();
	});
}

function exportImage(images, settings, path, reimager, {uuidMap, savedMap}) {
	const updater = new EventEmitter();

	new Promise(async resolve => {
		settings = JSON.parse(JSON.stringify(settings));
		let finished = 0;
		const total = images.length;

		updater.emit('update', {finished, total});

		let splitPath = path.split('.');
		let extension = splitPath.pop().toLowerCase();
		if (!extension || extension.length === 0) {
			if (path.endsWith('.'))
				path.push('png');
			else
				path.push('.png');
			extension = 'png';
		}

		if (extension === 'acq+jpg') {
			settings['acq'] = {};
			settings['jpeg'] = {};
		} else {
			extension = extension === 'tif' ? 'tiff' : (extension === 'jpg' ? 'jpeg' : extension);
			settings[extension] = {};
		}

		for (const {imageUuid, activePoints, activeLayers} of images) {
			let image = uuidMap.get(imageUuid);
			image = image ? image : savedMap.get(imageUuid);

			let imageSettings = JSON.parse(JSON.stringify(settings));
			imageSettings.uri = (extension === 'acq' ? path.slice(0, -4) : (extension === 'acq+jpg' ? path.slice(0, -8) : path)).replace(/{name}/gm, image.name);
			imageSettings.activePoints = activePoints ? activePoints : settings.activePoints;
			imageSettings.activeLayers = activeLayers ? activeLayers : settings.activeLayers;

			if (image)
				await reimager.send('writeImage', {
					uri: image.entryFile,
					operations: createOperations(imageSettings),
					settings: imageSettings
				});

			finished++;
			updater.emit('update', {finished, total});
		}

		updater.emit('finish', total);
		resolve();
	});

	return updater;
}

function createOperations(settings) {
	let operations = [];

	for (const layer of settings.activeLayers)
		operations.push({
			command: 'addLayer',
			args: [layer]
		});

	for (const point of settings.activePoints)
		switch(point.type) {
			case 'spot':
				operations.push({
					command: 'addPoint',
					args: [...point.pos, point.name]
				});
				break;
			case 'rect':
				operations.push({
					command: 'addRectangle',
					args: [...point.pos, point.name]
				});
				break;
			case 'circle':
				operations.push({
					command: 'addCircle',
					args: [...point.pos, point.name]
				});
				break;
			case 'polygon':
				operations.push({
					command: 'addPoly',
					args: [point.pos, point.name]
				});
				break;
		}


	operations.push({
		command: 'addScale',
		args: [settings.scalePosition]
	});

	return operations;
}

function createSettingKey(settings) {
	settings = JSON.parse(JSON.stringify(settings));
	delete settings.uuid;
	return JSON.stringify(settings);
}

module.exports = {
	lookForUpdate,
	exportImage,
	createOperations,
	createSettingKey
};