
var view={};

function remotecontrol(xmin, xmax, ymin, ymax, wayselect) {
	var addon="";

	if (wayselect != undefined) {
		addon=addon + "&select=way" + wayselect;
	}

	$.ajax({
		url: "http://localhost:8111/load_and_zoom?left=" + xmin + "&right=" + xmax + "&top=" + ymax + "&bottom=" + ymin + addon
	}).done(function(json) {
	});
}

function geoJsonStyle(feature) {

	if (view.layer.stylecolumn) {
		var stylename=feature.properties[view.layer.stylecolumn];
		if (stylename) {
			var style=view.layer.styles[stylename];
			if (style) {
				return style;
			}
		}
	}

	if (view.layer.styles != undefined && view.layer.styles.default != undefined) {
		return view.layer.styles.default;
	}

	return;
}

// Use the Handlebars compiled popupTemplate to create the popup text
function geoJsonIter(feat, layer) {
	  feat.properties.remotecontrol="<a href=\"#\" onclick=\"remotecontrol(this)\">Edit remote control</a>";
	  layer.bindPopup(view.template.popup(feat.properties));
}

function refreshoverlay(map, geojsonLayer) {
	var bbox=map.getBounds();

	var url="/spatialite-rest/bbox/"
		+ view.dbname + "/"
		+ view.layername + "/"
		+ bbox.getWest() + "/" 
		+ bbox.getNorth() + "/"
		+ bbox.getEast() + "/"
		+ bbox.getSouth();

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

function geojsonLayerInit(map, dbname, layername) {
	view.layername=layername;
	view.dbname=dbname;

	$.ajax({
		url: "/spatialite-rest/meta/" + view.dbname
	}).done(function(json) {
		view.meta=json;
		view.layer=view.meta.layer[view.layername];

		/* Add static geojson to map */
		if (view.layer && view.layer.boundary) {
			view.boundary=JSON.parse(view.layer.boundary);
			if (view.boundary) {
				boundslayer=L.geoJson(view.boundary)
				map.addLayer(boundslayer);
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

		geojsonLayer = L.geoJson.ajax("", { onEachFeature: geoJsonIter, style: geoJsonStyle, middleware: updatemeta });
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

function mapinit() {

	view.template={};
	Handlebars.registerPartial("remotecontrol", $("#remotecontrol-template").html());
	view.template.head=Handlebars.compile($("#head-template").html());

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


	var dbname="wayareaconflicts-nrw";
	var layername="wayareaconflict";

	if(url('?db')) {
		dbname=url('?db');
	}

	if(url('?layer')) {
		layername=url('?layer');
	}

	geojsonLayerInit(map, dbname, layername);

	var mappos = L.Permalink.getMapLocation(16, [51.917397,8.3930408]);
	map.setView(mappos.center, mappos.zoom);
	L.Permalink.setup(map);
}
