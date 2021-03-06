  // add a Humidity and Temperature chart (dual Y axis, C/F convert menu)
  var useFahrenheit = sessionStorage.getItem('fahrenheit') == 'true'; // temperature units - C (default) or F
  function addChartHT(title, subtitle, y_axis_left_title, y_axis_right_title) {

    // specify the chart options
    var chartOptions = {
      chart: {
        renderTo: 'chart-container',
        defaultSeriesType: 'line',
        backgroundColor: '#ffffff',
        zoomType: 'x',
        resetZoomButton: {
          relativeTo: 'chart'
        },
        panning: true,
        panKey: 'shift',
        events: {
          redraw: function() { chartRedrawEvent(this); }
        }
      },
      time: {
        useUTC: false
      },         
      title: { text: title },
      subtitle: { text: subtitle },
      plotOptions: {
        series: {
          marker: { radius: 2 },
          animation: true,
          step: false,
          borderWidth: 0,
          turboThreshold: 0,
          lineWidth: 1
        }
      },
      xAxis: {
        type: 'datetime',
        title: { text: 'Date' },
        minRange: 60*60*1000 // one hour
      },
      yAxis: [{
        showEmpty: false,
        title: { text: y_axis_left_title }
      }, {
        opposite: true,
        showEmpty: false,
        title: { text: y_axis_right_title } 
      }],
      navigation: {
        buttonOptions: {
          verticalAlign: 'bottom',
          y: -10
        }
      },      
      exporting: { 
        menuItemDefinitions: {
            // Custom definition
            units: {
                onclick: function () {
                  // toggle temperature units
                  sessionStorage.setItem('fahrenheit',(!useFahrenheit).toString());
                  location.reload();
                },
                text: useFahrenheit?'Celsius':'Fahrenheit'
            }
        },
        buttons: {
          contextButton: {
            menuItems: ['downloadPNG','units']
          }
        }
      },
      legend: { enabled: true },
      credits: {
        text: 'casportpony.com',
        href: '' // 'https://casportpony.com/' does not work on google sites
      }
    };

    // draw the chart
    return new Highcharts.Chart(chartOptions);
  }

  // add a series to the chart
  function addSeries(chart, name, channel_id, field_number, api_key, results, color, yaxis, conversion_function) {
    yaxis = yaxis || 0;
    conversion_function = conversion_function || function(x) {return x};
      
    // get the data with a webservice call
    $.getJSON('https://api.thingspeak.com/channels/' + channel_id + '/fields/' + field_number + '.json?offset=0&round=2&results=' + results + '&api_key=' + api_key, function(data) {

      var chart_data = [];
      var gap_count = 0;
      var field_name = 'field' + field_number;
      var prev_time = Date.parse(data.feeds[0].created_at);
    
      // iterate through each feed
      $.each(data.feeds, function() {
        // get value and time
        var value = conversion_function(parseFloat(this[field_name]));
        var time = Date.parse(this.created_at);
        // skip nulls in data (data with a time but no measurement)
        if (isNaN(value) && ++gap_count) return;
        gap_count=0;
        // deliberately add gap if no measurements for several minutes
        if (time-prev_time > 5*60*1000) chart_data.push([time-1,null]);
        prev_time=time;
    // add to chart data
        chart_data.push([time, value]);
      });

      // add the chart data (if valid)
      if (chart_data.length) chart.addSeries({ data: chart_data, name: name, color: color, yAxis: yaxis }); 
    });
  }  

  // values to forcibly include on chart (rescale to include)
  var chartIncludeValues = [[],[]];

  // chart zoom state
  var chartIsZoomed = false;

  // called on chart redraw (multiple times)
  function chartRedrawEvent(chart) {
    // track zoom state
    let wasZoomed = chartIsZoomed;
    chartIsZoomed = !!(chart.resetZoomButton);
      
    chart.yAxis.forEach(function(axis, index) {
      let extremes = axis.getExtremes();
      let chartIncludeMin = Math.min(...chartIncludeValues[index]);
      let chartIncludeMax = Math.max(...chartIncludeValues[index]);
     
      // reset extremes to auto if zoomed
      if (chartIsZoomed && (chartIsZoomed!=wasZoomed)) {
        axis.setExtremes(null,null);
      }
      // set extremes to include the chartIncludeValues for non zoomed
      if (!chartIsZoomed && (chartIncludeMin<extremes.min || chartIncludeMax>extremes.max)) {
        axis.setExtremes(Math.min(extremes.min,chartIncludeMin), Math.max(extremes.max,chartIncludeMax));
      }
    });
    
    // reset x extremes if exiting zoom
    if (wasZoomed && (chartIsZoomed!=wasZoomed) && chartXStart && chartXEnd) {
      chart.xAxis[0].setExtremes(chartXStart, chartXEnd);
    }
  }

  // add a horizontal reference line (and rescale chart if necessary)
  function addReferenceLine(chart, value, yaxis) {
    yaxis = yaxis || 0;
  
    // add reference line
    chart.yAxis[yaxis].addPlotLine({
      value: value,
      color: 'red',
      dashStyle: 'dot',
      width: 2
    });

    // add to the values that should be included on the chart (ie. rescale list)
    chartIncludeValues[yaxis].push(value);
  }

  // set y axis title and label color
  function setYAxisColor(chart, color, yaxis) {
    yaxis = yaxis || 0;

    chart.yAxis[yaxis].update({
      title:  { style: { color: color } },
      labels: { style: { color: color } }
    });
  }
  
  // x axis extents range can be positive or negative
  var chartXStart, chartXend;
  function setXAxisRange(chart, ref, range) {
    let chartRef = Date.parse(ref);
    chartXStart = Math.min(chartRef,chartRef+range);
    chartXEnd = Math.max(chartRef,chartRef+range);
    chart.xAxis[0].setExtremes(chartXStart,chartXEnd);
  }

  // helper function to round numbers correctly
  function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
  }

  // helper function to convert Celsius to Fahrenheit
  function temperatureCtoF(tempC) {
    return round((tempC * 1.8) + 32, 2);
  }
  