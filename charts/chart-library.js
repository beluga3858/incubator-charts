  // add a Humidity and Temperature chart (dual Y axis, C/F convert menu)
  var useFahrenheit = sessionStorage.getItem('fahrenheit') == 'true'; // temperature units - C (default) or F
  function addChartHT(title, subtitle, y_axis_left_title, y_axis_right_title) {
    // variable for the local date in milliseconds
    var localDate;

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
        title: { text: 'Date' }
      },
      yAxis: [{
        title: { text: y_axis_left_title } 
      }, {
        opposite: true,
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
    conversion_function = conversion_function || null;
    var field_name = 'field' + field_number;

    // get the data with a webservice call
    $.getJSON('https://api.thingspeak.com/channels/' + channel_id + '/fields/' + field_number + '.json?offset=0&round=2&results=' + results + '&api_key=' + api_key, function(data) {

      // blank array for holding chart data
      var chart_data = [];

      // iterate through each feed
      $.each(data.feeds, function() {
        // get value
        var value = this[field_name];
        // skip if not numerical
        if (isNaN(parseInt(value))) return;
        // create data point
        var point = new Highcharts.Point();
        point.x = getChartDate(this.created_at);
        point.y = parseFloat(value);
        if (conversion_function != null) point.y = conversion_function(point.y);
        // add location if possible
        if (this.location) { point.name = this.location; }
        // add to array
        chart_data.push(point);
      });

      // add the chart data
      chart.addSeries({ data: chart_data, name: name, color: color, yAxis: yaxis });
    });
  }

  // values to forcibly include on chart (rescale to include)
  var chartIncludeValues = [[],[]];

  // chart zoom state
  var chartIsZoomed = false;

  // called on chart redraw (multiple times)
  function chartRedrawEvent(chart) {
    chart.yAxis.forEach(function(axis, index) {
      let extremes = axis.getExtremes();
      let chartIncludeMin = Math.min(...chartIncludeValues[index]);
      let chartIncludeMax = Math.max(...chartIncludeValues[index]);
     
      // adjust chart range
      let wasZoomed = chartIsZoomed;
      chartIsZoomed = !!(chart.resetZoomButton);
      // reset extremes to match data series if zoomed
      if (chartIsZoomed && (chartIsZoomed!=wasZoomed)) {
        axis.setExtremes(extremes.dataMin,extremes.dataMax);
      }
      // set extremes to include the chartIncludeValues for non zoomed
      if (!chartIsZoomed && (chartIncludeMin<extremes.min || chartIncludeMax>extremes.max)) {
        axis.setExtremes(Math.min(extremes.min,chartIncludeMin), Math.max(extremes.max,chartIncludeMax));
      }
    });
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

  // helper function to convert date format from JSON and adjusts from UTC to local timezone
  var chartDateOffset = (new Date().getTimezoneOffset()) * 60000; // user's timezone offset in milliseconds
  function getChartDate(d) {
    // timezone offset is subtracted so that chart's x-axis is correct
    return Date.parse(d) - chartDateOffset;
  }

  // helper function to round numbers correctly
  function round(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
  }

  // helper function to convert Celsius to Fahrenheit
  function temperatureCtoF(tempC) {
    return round((tempC * 1.8) + 32, 2);
  }   
