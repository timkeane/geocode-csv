import $ from 'jquery'
import proj4 from 'proj4'
import nyc from 'nyc-lib/nyc'
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
import Popup from 'nyc-lib/nyc/ol/FeaturePopup'

const url = 'https://maps.nyc.gov/geoclient/v1/search.json?app_key=74DF5DB1D7320A9A2&app_id=nyc-lib-example'

let editFeature
const hidden = ['geometry', 'X', 'Y', '_geocodeResp', '_input', '_source']
const facilityTypes = ["H+H Hospital", "H+H community site", "One Medical", "Antibody survey"]
const testingTypes = [] // ['Diagnostic', 'Antibody']

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
new Popup({map, layers: [layer]})

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
    feature.set('ADDRESS', addr)
    feature.set('BOROUGH', boro)
    feature.setGeometry(new Point(center))
    $(`#fid_${fid} .address input`).val(addr)
    $(`#fid_${fid} .borough select`).val(boro)
    $(`#fid_${fid} .address, #fid_${fid} .borough`).removeClass('not-geocoded').addClass('geocoded')
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
    const features = format.readFeatures(reader.result)
    features.forEach(feature => {
      const x = feature.get('X') * 1
      const y = feature.get('Y') * 1
      const coord = proj4('EPSG:2263', 'EPSG:3857', [x, y])
      if (x > 0 && y > 0) {
        feature.getGeometry(new Point(coord))
      }
    })
    source.clear()
    source.addFeatures(features)
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
const facTypeSelect = '<select><option>H+H Hospital</option><option>H+H community site</option><option>One Medical</option><option>Antibody survey</option></select>'
const testTypeSelect = '<select><option>Diagnostic</option><option>Antibody</option></select>'

const boroUpdate = event => {
  const select = $(event.target)
  const feature = select.data('feature')
  feature.set('BOROUGH', select.val())
  $('.pressed').removeClass('pressed')
  editFeature = null
  tryAgain(feature)
}
const addrUpdate = event => {
  const input = $(event.target)
  const feature = input.data('feature')
  feature.set('ADDRESS', input.val())
  $('.pressed').removeClass('pressed')
  editFeature = null
  if (event.keyCode === 13) {
    tryAgain(feature)
  }
}
const facilityTypeUpdate = event => {
  const select = $(event.target)
  if (select.val()) {
    const feature = select.data('feature')
    feature.set('FACILITY_TYPE', select.val())
    select.parent().removeClass('invalid').addClass('valid')
  }
}
const testTypeUpdate = event => {
  const select = $(event.target)
  if (select.val()) {
    const feature = select.data('feature')
    feature.set('TESTING_TYPE', select.val())
    select.parent().removeClass('invalid').addClass('valid')
  }
}

const acquire = event => {
  if (editFeature) {
    const  fid = editFeature.getId()
    editFeature.setGeometry(new Point(event.coordinate))
    editFeature.set('ADDRESS', $(`#fid_${fid} .address input`).val())
    editFeature.set('BOROUGH', $(`#fid_${fid} .borough select`).val())
    $(`#fid_${fid} .address, #fid_${fid} .borough`).removeClass('not-geocoded').addClass('geocoded')
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
      const point = feature.getGeometry()
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
            if (prop === 'ADDRESS' && !point) {
              const input = $('<input>').keyup(addrUpdate).data('feature', feature)
              const button = $('<button>&#8599;</button>').click(chooseLocation).data('feature', feature)
              td.html(input.val(props[prop])).addClass('not-geocoded')
              td.append(button)
            } else if (prop === 'BOROUGH' && !point) {
              const select = $(boroSelect).change(boroUpdate).data('feature', feature)
              td.html(select.val(props[prop])).addClass('not-geocoded')
            } else if (prop === 'FACILITY_TYPE' && $.inArray(props[prop], facilityTypes) === -1) {
              const select = $(facTypeSelect).change(facilityTypeUpdate).data('feature', feature)
              td.html(select.val(props[prop])).addClass('invalid')
            } else if (prop === 'TESTING_TYPE' && testingTypes.length && $.inArray(props[prop], testingTypes) === -1) {
              const select = $(testTypeSelect).change(testTypeUpdate).data('feature', feature)
              td.html(select.val(props[prop])).addClass('invalid')
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
  const features = source.getFeatures()
  if (features.length) {
    source.removeFeature(features[features.length - 1])
    source.getFeatures().forEach(feature => {
      feature.invalid = () => {
        return !feature.getGeometry() ||
          $.inArray(feature.get('FACILITY_TYPE'), facilityTypes) == -1 ||
          (testingTypes.length && $.inArray(feature.get('TESTING_TYPE'), testingTypes) == -1)
      }
      if (feature.invalid()) failed.push(feature)
    })
    showFailed(failed)
  }
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
