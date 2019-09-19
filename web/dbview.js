
var view={};

function remotecontrol(xmin, xmax, ymin, ymax, wayselect) {
	var addon="";

	if (wayselect != undefined) {
		addon=addon + "&select=way" + wayselect;
	}

	if (location.protocol === 'http' ||
		bowser.check({chrome: "53", firefox: "55"})) {
		uri = "http://127.0.0.1:8111/load_and_zoom?";
	} else {
		uri = "https://127.0.0.1:8112/load_and_zoom?";
	}

	uri=uri + "left=" + xmin + "&right=" + xmax + "&top=" + ymax + "&bottom=" + ymin + addon;

	var loaded=false;
	var iframe = $('<iframe>')
		.hide()
		.appendTo('body')
		.attr("src", uri)
		.on('load', function() {
			$(this).remove();
			loaded = true;
		});

	setTimeout(function () {
		if (!loaded) {
			alert("Remote editor notification failed");
			iframe.remove();
		}
	}, 1000);
}

function geoJsonStyle(feature) {

	if (view.layer.stylecolumn) {
		var stylename=feature.properties[view.layer.stylecolumn];
		if (stylename) {
			var style=view.meta.style[stylename];
			if (style) {
				return style;
			}
		}
	}

	if (view.meta.style != undefined && view.meta.style.default != undefined) {
		return view.meta.style.default;
	}

	return;
}

// Use the Handlebars compiled popupTemplate to create the popup text
function geoJsonIter(feat, layer) {
	feat.properties.remotecontrol="<a href=\"#\" onclick=\"remotecontrol(this)\">Edit remote control</a>";
	if (view.template.popup) {
		layer.bindPopup(view.template.popup(feat.properties));
	}
}

function refreshoverlay(map, geojsonLayer) {
	var bbox=map.getBounds();

	if (view.layer.minzoom && map.getZoom() < view.layer.minzoom) {
		geojsonLayer.clearLayers();
		return;
	}

	var url="/spatialite-rest/bbox/"
		+ view.dbname + "/"
		+ view.layername + "/"
		+ bbox.getWest() + "/" 
		+ bbox.getNorth() + "/"
		+ bbox.getEast() + "/"
		+ bbox.getSouth() + "/"
		+ map.getZoom();

	geojsonLayer.refresh(url);
}

function renderheader() {
	$("#head").html(view.template.head( view ));
}

function updatemeta(data) {
	view.meta=data.properties.meta;
	view.featuresloaded=data.features.length;

	renderheader();

	return data;
}

function pointtolayer(feature, latlng) {
	var style=geoJsonStyle(feature);
	if (style.icon) {
		return new L.Marker(latlng, { icon: view.icon[style.icon] });
	}
	return new L.CircleMarker(latlng, style);
}

function geojsonLayerInit(map, dbname, layername) {
	view.layername=layername;
	view.dbname=dbname;

	$.ajax({
		url: "/spatialite-rest/meta/" + view.dbname
	}).done(function(json) {
		view.meta=json;
		view.layer=view.meta.layer[view.layername];

		/* Add static geojson to map */
		if (view.meta.boundary) {
			view.boundary=JSON.parse(view.meta.boundary);
			if (view.boundary) {
				boundarylayer=L.geoJson(view.boundary)
				map.addLayer(boundarylayer);
			}
		}

		if (view.layer.shortdescription) {
			document.title = view.layer.shortdescription;
		}

		if (view.layer && view.layer.popup) {
			try {
				view.template.popup=Handlebars.compile(view.layer.popup);
			} catch(err) {
				alert("Cant compile popup template");
			}
		}

		if (view.meta.icon) {
			/* Prepare icons in definition to be leaflet icons */
			view.icon={};
			for(var iname in view.meta.icon) {
				var icondef=view.meta.icon[iname];
				icondef.iconUrl="/spatialite-rest/file/" +
					view.dbname + "/" + icondef.iconUrl;
				view.icon[iname]=new L.Icon(icondef);
			}
		}

		geojsonLayer=L.geoJson.ajax("", {
			onEachFeature: geoJsonIter,
			style: geoJsonStyle,
			middleware: updatemeta,
			pointToLayer: pointtolayer
		});
		map.addLayer(geojsonLayer);

		map.on('zoomend', function() { refreshoverlay(map, geojsonLayer); });
		map.on('dragend', function() { refreshoverlay(map, geojsonLayer); });

		refreshoverlay(map, geojsonLayer);
		renderheader();

		/*
		 * If user did not supply a center and the database has a center
		 * zoom to databases center
		 */
		if (view.meta.center) {
			center=view.meta.center;
			if (center.lat && center.lon && center.zoom) {
				var mappos = L.Permalink.getMapLocation(center.zoom, [center.lat,center.lon]);
				map.setView(mappos.center, mappos.zoom);
			}
		}
	});
}

function map_init(dbname, layername) {
	var map=L.map('map');

	var colourlayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 18,
		attribution: 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
		id: 'colour'
	}).addTo(map);

	var bwlayer=L.tileLayer('http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', {
		maxZoom: 18,
		attribution: 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
		id: 'greyscale'
	});

	L.control.scale({ imperial: false }).addTo(map);
	L.control.layers({
			"OpenStreetmap": colourlayer,
			"Greyscale": bwlayer
	},{}).addTo(map);

	geojsonLayerInit(map, dbname, layername);

	var mappos = L.Permalink.getMapLocation(16, [51.917397,8.3930408]);
	map.setView(mappos.center, mappos.zoom);
	L.Permalink.setup(map);
}

function list_show() {
	$.ajax({
		url: "/spatialite-rest/list/"
	}).done(function(json) {
		$("#head").html(view.template.list({ list: json }));

		// Scroll database entry into view if we have a anchor
		var hash=$(window.location.hash);
		if (hash && hash[0]) {
			hash[0].scrollIntoView();
		}
	});
}

function init() {
	view.template={};
	Handlebars.registerPartial("remotecontrol", $("#remotecontrol-template").html());
	view.template.head=Handlebars.compile($("#head-template").html());
	view.template.list=Handlebars.compile($("#list-template").html());

	var dbname;
	if(url('?db')) {
		dbname=url('?db');
	}

	var layername;
	if(url('?layer')) {
		layername=url('?layer');
	}

	if (!dbname || !layername) {
		list_show();
	} else {
		map_init(dbname, layername);
	}
}
