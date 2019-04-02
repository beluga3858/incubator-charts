window.onload=function(){
  // chart title
  var chart_title = 'All Incubator Temperatures';
  var chart_subtitle = 'Extended timeframe';

  // reference line value
  var reference_line = 37.5; 
  if (useFahrenheit) reference_line = temperatureCtoF(reference_line);

  // start and end times to plot
  const oneday=24*60*60*1000;
  var end_time = new Date();
  var start_time = new Date(end_time.getTime() - (30*oneday)); // 30 days
  
  // series to plot
  var series_spreadsheet='1ceMW62pXpXqIMkkMqoivF2xflBU0jVBxwjasjA2zgrk';
  var sheets_apikey='AIzaSyCVVYOJ2NG1Q38_RgzXBmSeDUBXthv_D1Y';
  
  // add a blank chart
  var my_chart = addChartMultiTemperature(chart_title, chart_subtitle);
  
  // dyamically load the series to plot
  var series=[];
  showLoadingSpinner('Loading sensor list'); 
  $.getJSON('https://sheets.googleapis.com/v4/spreadsheets/'+series_spreadsheet+'/values/Sheet1?key='+sheets_apikey, function(data) {
    for(let i=1; i<data.values.length; i++) {
      let s = {};
      data.values[i].forEach((value,index) => s[data.values[0][index].replace(" ","_")]=value);
      s.conv=useFahrenheit?temperatureCtoF:null;
      if (s.api_key && s.display_name) series.push(s);
    }

    // add the series data (no redraw)
    let seriespromises = [];
    series.forEach(s => seriespromises.push(addInitialSeriesData(my_chart, s.display_name, s.ch_id, s.temperature_field, s.api_key, start_time, end_time, s.color, 0, s.conv))); 

    // add reference line
    addReferenceLine(my_chart, reference_line);

    // wait for all the series to be added before drawing chart
    Promise.all(seriespromises).then(() => {
      my_chart.hideLoading();
      my_chart.redraw(false); // animation disabled
    });
  });
  
  

        
//------------------------------------------------------------------------------------------       
  
  // dynamically update data for visible region
  function afterSetXExtremes(e) {
    series.forEach(s => updateSeries(Highcharts.charts[0], s.display_name, s.ch_id, s.temperature_field, s.api_key, e.min, e.max, s.color, 0, s.conv));
  }  

  // get date in thingspeak query format (UTC) YYYY-MM-DD%20HH:NN:SS
	function thingspeakFormatDate(date) {
  	let d = new Date(date);
    return d.toISOString().substr(0,19).replace("T"," ");
  }
  
  // calculate decimation value for thingspeak
  function thingspeakDecimation(start_time, end_time) {
    let range = (end_time-start_time)/(60*1000); // in minutes
    for (let decimation of [/*1440,720,*/240,60,30,20,10]) { 
    	if ((range/decimation) > 130) return decimation;
    }
    return 0;
  }
  
  // show loading spinner on chart
  function showLoadingSpinner(text) {
    const spinner='https://raw.githack.com/beluga3858/incubator-charts/master/charts/assets/Dual-Ring-1.5s-64px.svg';
    my_chart.showLoading('<img src="'+spinner+'"><br>'+text); 
  }
  
	// add initial data series, chunking as necessary for extended timeframe
  function addInitialSeriesData(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function) {
    return new Promise((resolve, reject) => {

      yaxis = yaxis || 0;
      conversion_function = conversion_function || function(x) {return x};
      start_time=new Date(start_time).getTime(); // convert to msec
      end_time=new Date(end_time).getTime(); // convert to msec
      
      // display loading message
      showLoadingSpinner('Loading data');
      
      // calculate data decimation (if any)
      var decimation=thingspeakDecimation(start_time, end_time);

      // build task list
      // retrieving in 5 day blocks. Max data points per retrieval is 8000. Each point is
      // at ~1 min intervals. 8000min = 133hrs = 5.5days
      const fivedays=5*24*3600*1000;
      let promises = [];
      let block_start_time=start_time;
      while(block_start_time < end_time) {
        let block_end_time=block_start_time+Math.min(fivedays,end_time-block_start_time);
        promises.push(_thingspeakGetDataBlock(URL, channel_id, field_number, api_key, block_start_time, block_end_time, decimation, conversion_function));
        block_start_time=block_end_time+1;
      }
      
      // wait for all the async retrieval to happen
      Promise.all(promises).then(all_data => {
        // all tasks complete. Build composite data
        let chart_data = [];
        for(let data_block of all_data) {
          chart_data.push.apply(chart_data,data_block);
        }

        // add series (if any data) to chart
        if (chart_data.length) {
          chart_data.push([end_time+1, null]); // ensure end time included
          chart.addSeries({ data: chart_data, name: name, color: standardize_color(color), yAxis: yaxis, id: name}, false);
        }
        resolve();
      });
    });
  }

	// async retrieval of a data block
  function _thingspeakGetDataBlock(URL, channel_id, field_number, api_key, start_time, end_time, decimation, conversion_function) {
    return new Promise((resolve, reject) => {

      // get the data with a webservice call
      var url = 'https://api.thingspeak.com/channels/' + channel_id + 
          '/fields/' + field_number + '.json?offset=0&round=2' +
          '&api_key=' + api_key +
          '&start=' + thingspeakFormatDate(start_time) + 
          '&end=' + thingspeakFormatDate(end_time) +
          '&median=' + decimation;
          
      $.getJSON(url, function(data) {

        var chart_data = [];
        var field_name = 'field' + field_number;
        var prev_time = Date.parse(data.feeds[0].created_at);

        // iterate through data
        $.each(data.feeds, function() {
          // get value and time
          var value = conversion_function(parseFloat(this[field_name]));
          var time = Date.parse(this.created_at);
          // skip nulls in data (data with a time but no measurement)
          if (isNaN(value)) return;
          // deliberately add gap if no measurements for several minutes
          if (time-prev_time > (decimation+5)*60*1000) chart_data.push([time-1,null]);
          prev_time=time;
          // add to chart data
          chart_data.push([time, value]);
        });

				// return data
        resolve(chart_data);
      });
    });
  }   
    
  // add a data series to the chart
  function addSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function) {
  	_loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, true);
  }
  
  // update a data series on the chart
  function updateSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function) {
    _loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, false);
  }
  
  // add or update a data series 
  function _loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, add_new) {
    yaxis = yaxis || 0;
    conversion_function = conversion_function || function(x) {return x};

 		// calculate data decimation (if any)
    var decimation=thingspeakDecimation(start_time, end_time);

    // get the data with a webservice call
    var URL = 'https://api.thingspeak.com/channels/' + channel_id + 
        '/fields/' + field_number + '.json?offset=0&round=2' +
        '&api_key=' + api_key + // '&results=' + results + 
        '&start=' + thingspeakFormatDate(start_time) + '&end=' + thingspeakFormatDate(end_time) +
        '&median=' + decimation; 
		//alert(URL);
    $.getJSON(URL, function(data) {

      var chart_data = [];
      var field_name = 'field' + field_number;
      var prev_time = Date.parse(data.feeds[0].created_at);
    
      // iterate through each feed
      $.each(data.feeds, function() {
        // get value and time
        var value = conversion_function(parseFloat(this[field_name]));
        var time = Date.parse(this.created_at);
        // skip nulls in data (data with a time but no measurement)
        if (isNaN(value)) return;
        // deliberately add gap if no measurements for several minutes
        if (time-prev_time > (decimation+5)*60*1000) chart_data.push([time-1,null]);
        prev_time=time;
        // add to chart data
        chart_data.push([time, value]);
      });
      
      // add/update the chart data (if valid)
      if (chart_data.length) {
        if (add_new) {
          chart_data.push([Date.parse(end_time+1), null]); // ensure end time included
          chart.addSeries({ data: chart_data, name: name, color: standardize_color(color), yAxis: yaxis, id: name}); 
        } else {
          //if (!chart.get(name)) alert('series missing:'+name);
          chart.get(name).setData(chart_data);     
        }
      }
    });
  }   

  // create a multi temperature chart (stock chart style)
  function addChartMultiTemperature(title, subtitle, y_axis_title) {

    var chartOptions = {
      chart: {
        renderTo: 'chart-container',
        zoomType: 'x'
      },
    
    	time: {
        useUTC: false
      },        

      rangeSelector: {
        buttons: [
          { type: 'minute', count: 60, text: '60m' },
          { type: 'hour',   count: 3,  text: '3h'  },
          { type: 'hour',   count: 12, text: '12h' },
          { type: 'day',    count: 1,  text: '1d'  },              
          { type: 'day',    count: 5,  text: '5d'  },                 
        ],
        selected: 3,
        inputEnabled: false,
        
      },

      xAxis: {
        ordinal: false,
        events: {
          afterSetExtremes: afterSetXExtremes
        },
        minRange: 3600 * 1000, // one hour
        maxRange: 5*24*3600*1000,
      },      

      yAxis: {
        title: { text: 'Temperature °'+(useFahrenheit?'F':'C') }
      },

      title: { text: title },

      subtitle: { text: subtitle },

			plotOptions: {
        series: {
          showInNavigator: true,
          dataGrouping: {
            enabled: false, 
          },
          
        },
      },
      
      navigator: {
        adaptToUpdatedData: false,
        series: {
          fillOpacity: 0,
          dataGrouping: {
            enabled: false,
          }
        }
      },  

      scrollbar: {
        liveRedraw: false
      },      
      
      tooltip: {
        valueDecimals: 2,
        valueSuffix: useFahrenheit?'°F':'°C'
      },
        
      exporting: { 
        menuItemDefinitions: {
            // Custom definition
            units: {
                onclick: () => {toggleFahrenheit()},
                text: useFahrenheit?'Use Celsius':'Use Fahrenheit'
            }
        },
        buttons: {
          contextButton: {
            menuItems: ['downloadPNG','downloadJPEG','downloadSVG','separator','units']
          },
          customButton: {
            onclick: () => {toggleFahrenheit()},
            text: useFahrenheit?'Use °C':'Use °F',
            theme: {
              'font-size':'10px',
              fill: '#EEEEEE',
              r: 4,
              states: {
                hover: {
                  fill: 'lightgrey'
                },
              }
            }
          },          
        }
      },
      
      legend: { enabled: true },
      
      credits: {
        text: 'casportpony.com',
        href: '' // 'https://casportpony.com/' does not work on google sites
      }        

    };
    
    // create the chart
    return new Highcharts.stockChart(chartOptions);
  }
  
  // switch temperature units
  function toggleFahrenheit() {
    sessionStorage.setItem('fahrenheit',(!useFahrenheit).toString());
    location.reload();
  }
  
	// convert color to RGB code
  function standardize_color(str){ 
    var ctx = document.createElement('canvas').getContext('2d'); 
    ctx.fillStyle = str; 
    return ctx.fillStyle; 
  } 
}