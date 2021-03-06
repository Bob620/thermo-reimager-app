import React, { Component } from 'react';

import '../general/common.scss'
import './options.scss'

import constants from '../../../constants';
import settingActions from '../settings/actions';
import generalStore from '../general/store';
import settingStore from '../settings/store';

module.exports = class OptionsList extends Component {
	constructor(props) {
		super(props);

		this.state = {
			image: '',
			dragging: {
				element: '',
				index: -1
			},
			layers: settingStore.get('layers'),
			selectedElement: ''
		}
	}

	UNSAFE_componentWillUpdate(nextProps, nextState, nextContext) {
		const selectedUuid = generalStore.get('selectedUuid');
		let image = generalStore.get('images').get(selectedUuid);
		image = image ? image : generalStore.get('safebox').get(selectedUuid);

		settingStore.data.commitChanges();

		if (image && image.uuid !== this.state.image || settingStore.get('layers').length !== this.state.layers.length)
			this.setState({
				image: image.uuid,
				layers: settingStore.get('layers')
			});
		else {
			settingStore.data.set('layers', nextState.layers);

			const layerOrder = settingStore.get('layerOrder');
			const newOrder = nextState.layers.map(layer => layer.element);
			let outputOrder = [];

			for (let i = 0, j = 0; layerOrder.length > i || newOrder.length > j;) {
				if (newOrder.length > j)
					if (layerOrder.length > i)
						if (layerOrder[i] === newOrder[j]) {
							outputOrder.push(layerOrder[i]);
							i++;
							j++;
						} else {
							outputOrder.push(newOrder[j]);
							j++;
							i++;
						}
					else {
						outputOrder.push(newOrder[j]);
						j++;
					}
				else {
					if (layerOrder.length > i) {
						outputOrder.push(layerOrder[i]);
						i++;
					}
				}
			}

			settingStore.data.set('layerOrder', outputOrder);
			settingStore.data.commitChanges();
		}
	}

	render() {
		let image = generalStore.get('images').get(this.state.image);
		image = image ? image : generalStore.get('safebox').get(this.state.image);

		const activePoints = settingStore.get('activePoints');
		const activeLayers = settingStore.get('activeLayers');
		const layerColors = settingStore.get('layerColors');
		const optionsList = generalStore.get('optionsList');
		const selectAllPoints = settingStore.get('selectAllPoints');
		const layerOpacity = settingStore.get('layerOpacity');
		const selectedElement = this.state.selectedElement;
		const colors = generalStore.get('colors');

		return (
			<div className={`options-list ${optionsList === constants.optionsLists.POINTS ? 'scroll' : ''}`}>
				{optionsList === constants.optionsLists.LAYERS &&
					<div className='color-selector'>
						<p>Opacity</p>
						<div className='opacity'>
							<input onChange={settingActions.changeLayerOpacity}
								   type='text'
								   value={layerOpacity === '' ? '' : (layerOpacity * 100)}
								   maxLength='3' min='0' max='100'
							/>
						</div>
						<p>Colors</p>
						<div className='colors'>
							<div style={{'backgroundColor': 'rgba(0,0,0,0)'}}
								 key='none'
								 onClick={settingActions.removeLayer.bind(undefined, selectedElement)}/>
							{generalStore.get('colors').map(color =>
								<div style={{'backgroundColor': color.RGBA}}
									 key={color.name}
									 onClick={() => {
									 	if (!activeLayers.includes(selectedElement))
									 		settingActions.addLayer(selectedElement);
									 	settingActions.colorLayer(selectedElement, color);
									 }}/>
							)}
						</div>
					</div>
				}
				<ul>
					{image && optionsList === constants.optionsLists.POINTS &&
						<li key='selectAll'
							className={selectAllPoints ? 'div-selected point' : 'point'}
							onClick={selectAllPoints ? settingActions.deselectAllPoints : settingActions.selectAllPoints.bind(undefined, image.uuid)}>
							<div>
								<div/>
							</div>
							<p>Select All</p>
						</li>
					}
					{optionsList === constants.optionsLists.POINTS ?
						image && Array.from(image.points.values()).map(point =>
							<li key={point.uuid}
								className={activePoints.includes(point.uuid) ? 'div-selected point' : 'point'}
								onClick={activePoints.includes(point.uuid) ? settingActions.removePoint.bind(undefined, point.uuid) :
									settingActions.addPoint.bind(undefined, point.uuid)}>
								<div>
									<div />
								</div>
								<p>{point.type === 'spot' ? 'Point' : `${point.type[0].toUpperCase()}${point.type.slice(1)}`} {point.name}</p>
							</li>)
						: (optionsList === constants.optionsLists.LAYERS ?
						image && this.state.layers.filter(i => i).map(layer =>
							<li key={layer.element}
								draggable="true"
								onMouseDown={() => {this.setState({selectedElement: layer.element})}}
								onDragStart={e => {
									e.dataTransfer.dropEffect = 'move';
									this.setState({
										dragging: layer
									});
								}}
								onDragEnd={e => {
									this.setState({
										dragging: ''
									});
								}}
								onDrop={(e) => {
									e.preventDefault();
								}}
								onDragOver={e => {
									e.preventDefault();
									const otherIndex = this.state.layers.indexOf(this.state.dragging);
									let index = this.state.layers.indexOf(layer);
									if (otherIndex !== -1 && this.state.dragging !== layer && (otherIndex - 1 === index || otherIndex + 1 === index)) {
										const layers = JSON.parse(JSON.stringify(this.state.layers));
										if (index > otherIndex) {
											layers.splice(index, 1, layer, this.state.dragging);
											layers.splice(otherIndex, 1);
										} else {
											layers.splice(otherIndex, 1, this.state.dragging, layer);
											layers.splice(index, 1);
										}
										this.setState({
											layers
										});
									}
								}}
								className={(activeLayers.includes(layer.element) ? 'div-selected layer' : 'layer') + (this.state.selectedElement === layer.element ? ' selected' : '')}>
								{layer.element === constants.settings.BASELAYER ?
									<div
										onClick={activeLayers.includes(selectedElement) ? settingActions.removeLayer.bind(undefined, selectedElement) : settingActions.addLayer.bind(undefined, selectedElement)}>
										<div style={{'backgroundColor': activeLayers.includes(layer.element) ? '#0fb9b1' : '#4b6584'}}/>
									</div>
									:
									<div
										onClick={activeLayers.includes(selectedElement) ? settingActions.removeLayer.bind(undefined, selectedElement) : () => {
											settingActions.addLayer(selectedElement);
											if (layerColors[layer.element] === undefined)
												settingActions.colorLayer(selectedElement, colors[Math.round(Math.random() * (colors.length - 1))]);
										}}>
										<div style={{'backgroundColor': layerColors[layer.element] && activeLayers.includes(layer.element) ? layerColors[layer.element].RGBA : '#4b6584'}}/>
									</div>
								}
								<p>{layer.name.slice(0, 1).toUpperCase() + layer.name.slice(1, layer.name.length)}</p>
							</li>)
						: <div/>)
					}
				</ul>
			</div>
		)
	}
};