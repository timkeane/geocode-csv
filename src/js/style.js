import Style from 'ol/style/Style'
import RegularShape from 'ol/style/RegularShape'
import Stroke from 'ol/style/Stroke'
import Circle from 'ol/style/Circle'
import Fill from 'ol/style/Fill'

const today = new Date().toISOString().split('T')[0]

const geocode = new Style({
  image: new RegularShape({
    stroke: new Stroke({width: 2}),
    points: 4,
    radius: 10,
    radius2: 0,
    angle: 0
  })
})

const location = feature => {
  return new Style({
    image: new Circle({
      stroke: new Stroke({width: 1, color: '#000'}),
      fill: new Fill({color: feature._geocoded ? 'rgba(0,255,0,.6)' : 'rgba(0,0,255,.6)'}),
      radius: 8
    })
  })
}

export default {geocode, location}
