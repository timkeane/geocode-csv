import $ from 'jquery'
import Source from 'ol/source/Vector'
import Layer from 'ol/layer/Vector'
import Papa from 'papaparse'
import Geoclient from 'nyc-lib/nyc/Geoclient'
import Basemap from 'nyc-lib/nyc/ol/Basemap'
import LocationMgr from 'nyc-lib/nyc/ol/LocationMgr'
import CsvAddr from 'nyc-lib/nyc/ol/format/CsvAddr'
import FeatureTip from 'nyc-lib/nyc/ol/FeatureTip'
import style from './style'
import Point from 'ol/geom/Point'

const url = 'https://maps.nyc.gov/geoclient/v1/search.json?app_key=74DF5DB1D7320A9A2&app_id=nyc-lib-example'

const hidden = ['geometry', 'X', 'Y', '_geocodeResp', '_input', '_source']

let editFeature
const map = new Basemap({target: 'map'})
const locationMgr = new LocationMgr({map, url})
const source = new Source()
const layer = new Layer({
  source, 
  style: style.location,
  zIndex: 20000
})
const geocoder = new Geoclient({url})
const format = new CsvAddr({
  geocoder,
  locationTemplate: '${ADDRESS}, ${BOROUGH}'
})

map.addLayer(layer)
locationMgr.mapLocator.layer.setStyle(style.geocode)

let photo = false
$('.photo').click(() => {
  photo = !photo
  map[photo ? 'showPhoto' : 'hidePhoto']()
  $('.photo').html(photo ? 'Base Map' : 'Aerial Photo')
})

geocoder.on('geocoded', location => {
  if (geocoder._feature) {
    const feature = geocoder._feature
    const fid = feature.getId()
    const addr = location.name.split(',')[0].trim()
    const boro = location.name.split(',')[1].trim()
    const center = location.coordinate
    feature._geocoded = true
    feature.set('ADDRESS', addr)
    feature.set('BOROUGH', boro)
    feature.setGeometry(new Point(center))
    $(`#fid_${fid} input`).val(addr).parent().addClass('geocoded')
    $(`#fid_${fid} select`).val(boro).parent().addClass('geocoded')
    geocoder._feature = null
    map.getView().animate({center, zoom: 15})
  }
})

geocoder.on('ambiguous', possible => {
  if (geocoder._feature) {
    geocoder._feature = null
  }
})

$('.load-csv').click(() => {
  const input = $('<input class="file-in" type="file">')
  const reader = new FileReader()
  reader.onload = () => {
    source.clear()
    source.addFeatures(format.readFeatures(reader.result))
  }
  $('body').append(input)
  input.change(event => {
    input.remove()
    reader.readAsText(event.target.files[0])
  })
  input.trigger('click')
})

const tryAgain = feature => {
  if (!geocoder._feature) {
    geocoder._feature = feature
    geocoder.search(`${feature.get('ADDRESS')}, ${feature.get('BOROUGH')}`)
  }
}

const boroSelect = '<select><option>Bronx</option><option>Brooklyn</option><option>Manhattan</option><option>Queens</option><option>Staten Island</option></select>'
const addrInput = '<input>'

const boroUpdate = event => {
  const select = $(event.target)
  const feature = select.data('feature')
  feature.set('BOROUGH', select.val())
  tryAgain(feature)
}
const addrUpdate = event => {
  const input = $(event.target)
  const feature = input.data('feature')
  feature.set('ADDRESS', input.val())
  if (event.keyCode === 13) {
    tryAgain(feature)
  }
}

const acquire = event => {
  if (editFeature) {
    const  fid = editFeature.getId()
    editFeature._geocoded = true
    editFeature.setGeometry(new Point(event.coordinate))
    $(`#fid_${fid} .address, #fid_${fid} .borough`).addClass('geocoded')
  }
}

const chooseLocation = event => {
  const button = $(event.target).toggleClass('pressed')
  $('.pressed').not(button).removeClass('pressed')
  if (button.hasClass('pressed')) {
    map.on('click', acquire)
    editFeature = button.data('feature')
  } else {
    editFeature = null
  }
}

const showFailed = features => {
  const table = $('.failed table')
  const thead = table.find('thead').empty()
  const tbody = table.find('tbody').empty()
  if (features.length) {
    features.forEach((feature, i) => {
      const props = feature.getProperties()
      const tr = $(`<tr id="fid_${feature.getId()}"></tr>`)
      if (props._input !== format.locationTemplate) {
        tbody.append(tr)
      }
      Object.keys(props).forEach(prop => {
        if ($.inArray(prop, hidden) === -1) {
          if (i === 0) {
            thead.append(`<th>${prop}</th>`)
          }
          if (props._input !== format.locationTemplate) {
            const td = $(`<td class="${prop.toLowerCase()}"></td>`)
            tr.append(td)
            if (prop === 'ADDRESS') {
              const input = $(addrInput).keyup(addrUpdate).data('feature', feature)
              const button = $('<button>&#8599;</button>').click(chooseLocation).data('feature', feature)
              td.html(input.val(props[prop]))
              td.append(button)
            } else if (prop === 'BOROUGH') {
              const select = $(boroSelect).change(boroUpdate).data('feature', feature)
              td.html(select.val(props[prop]))
            } else {
              td.html(props[prop])
            }
          }
        }
      })
    })
    $('.failed').show()
    table.focus()
  } else {
    table.hide()
  }
}

format.on('geocode-complete', () => {
  const failed = []
  source.getFeatures().forEach(feature => {
    if (!feature.getGeometry()) {
      failed.push(feature)
    }
  })
  showFailed(failed)
})

$('.save-csv').click(() => {
  const rows = []
  source.getFeatures().forEach(feature => {
    const props = feature.getProperties()
    if (props._input !== format.locationTemplate) {
      const point = feature.getGeometry()
      const row = {}
      if (point) {
        const coord = proj4('EPSG:3857', 'EPSG:2263', point.getCoordinates())
        row.X = Math.round(coord[0])
        row.Y = Math.round(coord[1])
      }
      Object.keys(props).forEach(prop => {
        if ($.inArray(prop, hidden) === -1) {
          row[prop] = props[prop]
        }
      })
      rows.push(row)
    }
  })
  const csv = Papa.unparse(rows, {header: true})
  // this method say saveGeoJson but is just saving text - should add a saveText method
  map.storage.saveGeoJson('location.csv', csv)
})

const label = f => {
  return {
    html: `<div><strong>${f.get('NAME')}</strong></div><div>${f.get('ADDRESS')}, ${f.get('BOROUGH')}<div></div>`
  }
}

new FeatureTip({map, tips: [{layer, label}]})

global.map = map
global.source = source
global.layer = layer
global.geocoder = geocoder
