const fs = require('fs');
const EventEmitter = require('events');

const createWindow = require('./createwindow.js');
const ChildSpawn = require('./childspawn.js');
const IPC = require('./ipc.js');
const Communications = require('./communications.js');
const GenerateUuid = require('./generateuuid.js');

const [version, channel] = require('../../package.json').version.split('-');
const constants = require('../../constants.json');

const { app, dialog, shell, net } = require('electron');

let window = null;
const reimager = new ChildSpawn('reimager');
const relayerer = new ChildSpawn('relayerer');

let activeDir = '';
let imageMap = new Map();

let uuidMap = new Map();
let entryMap = new Map();
let savedMap = new Map();

//app.setAppUserModelId(process.execPath);

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

function exportImage(images, settings, path) {
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

app.on('ready', async () => {
	if (window === null)
		window = createWindow();

	const comms = new Communications(new IPC(window));
	let recentlyUpdated = new Map();

	setTimeout(async () => {
		try {
			const latest = await lookForUpdate();

			if (latest.version > version)
				comms.send('notification', {
					type: 'update',
					title: `Update Available (${latest.version})`,
					description: latest.description,
					link: latest.link,
					linkAlt: 'Download Page'
				});
		} catch (err) {
		}
	}, 100);

	setInterval(async () => {
		try {
			const latest = await lookForUpdate();

			if (latest.version > version)
				comms.send('notification', {
					type: 'update',
					title: `Update Available (${latest.version})`,
					description: latest.description,
					link: latest.link,
					linkAlt: 'Download Page'
				});
		} catch (err) {}
	}, 86400000);

	setInterval(() => {
		try {
			if (recentlyUpdated.size > 0)
				Array.from(recentlyUpdated.keys()).map(async uri => {
					recentlyUpdated.delete(uri);
					const thermo = (await reimager.send('getImages', {uri: uri + '/'}))[0];
					let uuids = [];

					for (const [uuid, therm] of uuidMap)
						if (therm.entryFile === thermo.entryFile)
							uuids.push(uuid);

					comms.send('updateDirectory', {
						images: uuids.map(uuid => {
							const temp = JSON.parse(JSON.stringify(thermo));
							temp.uuid = uuid;
							temp.imageUuid = uuid;
							uuidMap.set(uuid, temp);
							return temp;
						})
					});
				});
		} catch (err) {

		}
	}, 1000);

	reimager.on('dirUpdate', async ({filename, uri}) => {
		if (filename.endsWith('.tif')) {
			const [dirName, type, element, line] = filename.split('_');

			if (element && element !== 'Grey' && element !== 'RefGrey' && !element.startsWith('Spec') && line && line.length === 1)
				await relayerer.send('relayer', {
					output: `${uri}${dirName}.MAP.EDS/${dirName} ${type} ${element}_${line}.layer`,
					input: uri + filename
				});
		} else if (!recentlyUpdated.has(uri + filename))
			recentlyUpdated.set(uri + filename, true);
	});

	comms.on('canvas', data => {
		reimager.send('canvas', data);
	});

	comms.on('saveImage', async data => {
		const uuid = GenerateUuid.v4();

		let oldThermo = uuidMap.get(data.uuid);
		oldThermo = oldThermo ? oldThermo : savedMap.get(data.uuid);

		oldThermo = JSON.parse(JSON.stringify(oldThermo));
		oldThermo.uuid = uuid;

		uuidMap.set(uuid, oldThermo);

		return {uuid};
	});

	comms.on('removeImage', async data => {
		savedMap.delete(data.imageUuid);
	});

	comms.on('writeImages', ({images, settings}) => {
		return new Promise((resolve, reject) => {
			window.setProgressBar(2);

			try {
				dialog.showSaveDialog({
					defaultPath: '{name}.png',
					filters: constants.export.FILTERS
				},
				async path => {
					if (path) {
						const exports = exportImage(images, settings, path);

						exports.on('update', ({finished, total}) => {
							window.setProgressBar(finished / total);
							comms.send('exportUpdate', {exported: finished, total, type: 'all'});
						});

						exports.on('finish', total => {
							window.setProgressBar(-1);
							resolve();
						});
					} else {
						window.setProgressBar(-1);
						resolve();
					}
				});
			} catch(err) {
				window.setProgressBar(-1);
				reject(err);
			}
		});
	});

	comms.on('writeImage', ({imageUuid, settings}) => {
		return new Promise((resolve, reject) => {
			window.setProgressBar(2);
			let image = uuidMap.get(imageUuid);
			image = image ? image : savedMap.get(imageUuid);
			try {
				dialog.showSaveDialog({
					defaultPath: image.name + '.png',
					filters: constants.export.FILTERS
				},
				async path => {
					if (path) {
						const exports = exportImage([image], settings, path);

						exports.on('update', ({finished, total}) => {
							window.setProgressBar(finished / total);
							comms.send('exportUpdate', {exported: finished, total, type: 'all'});
						});

						exports.on('finish', total => {
							window.setProgressBar(-1);
							resolve();
						});
					} else {
						window.setProgressBar(-1);
						resolve();
					}
				});
			} catch(err) {
				window.setProgressBar(-1);
				reject(err);
			}
		});
	});

	comms.on('loadImage', async data => {
		window.setProgressBar(2);
		const imageKey = createSettingKey(data);
		const testThermo = imageMap.get(imageKey);

		if (!testThermo) {
			let image = uuidMap.get(data.imageUuid);
			image = image ? image : savedMap.get(data.imageUuid);

			data.settings.png = {};

			let [thermo] = await reimager.send('processImage', {
				uri: image.entryFile,
				operations: createOperations(data.settings),
				settings: data.settings
			});

			thermo.uuid = data.uuid;

			const imageKeys = Array.from(imageMap.keys()).reverse();
			while (imageMap.size >= 10)
				imageMap.delete(imageKeys.pop());

			imageMap.set(imageKey, thermo);

			window.setProgressBar(-1);
			return thermo;
		}

		testThermo.imageUuid = testThermo.uuid;
		testThermo.uuid = data.uuid;
		window.setProgressBar(-1);
		return testThermo;
	});

	comms.on('processDirectory', async data => {
		window.setProgressBar(2);
		let dirUri = data.dir.replace(/\\/gmi, '/');
		if (!dirUri.endsWith('/'))
			dirUri = dirUri + '/';

		const files = fs.readdirSync(dirUri, {withFileTypes: true});
		const dirNames = files.filter(file => file.isDirectory()).reduce((dirs, file) => {
			dirs[file.name] = fs.readdirSync(`${dirUri}${file.name}`, {withFileTypes: true}).map(file => file.name);
			return dirs;
		}, {});

		for (const file of files)
			if (file.isFile() && file.name.endsWith('.tif')) {
				const [dirName, type, element, line] = file.name.split('_');

				if (element && element !== 'Grey' && element !== 'RefGrey' && !element.startsWith('Spec') && line && line.length === 1)
					if (dirNames[`${dirName}.MAP.EDS`] && !dirNames[`${dirName}.MAP.EDS`].includes(`${dirName} ${type} ${element}_${line}.layer`))
						await relayerer.send('relayer', {
							output: `${dirUri}${dirName}.MAP.EDS/${dirName} ${type} ${element}_${line}.layer`,
							input: dirUri + file.name
						});
			}

		reimager.send('unwatch', {uri: activeDir});
		activeDir = dirUri;

		const thermos = await reimager.send('getDir', {uri: dirUri});

		for (const thermo of thermos) {
			let uuid = entryMap.get(thermo.entryFile);
			uuid = uuid ? uuid : thermo.uuid;
			thermo.uuid = uuid;
			thermo.imageUuid = uuid;
			entryMap.set(thermo.entryFile, uuid);
			uuidMap.set(uuid, thermo);
		}

		reimager.send('watchDir', {uri: dirUri});

		window.setProgressBar(-1);
		return {
			thermos
		};
	});
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin')
		app.quit();
});

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (window === null)
		window = createWindow();
});

app.on('web-contents-created', (event, contents) => {
	contents.on('new-window', async (event, navigationUrl) => {
		event.preventDefault();
		shell.openExternal(navigationUrl)
	});

	contents.on('will-navigate', (event, navigationUrl) => {
		event.preventDefault();
	});
});

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